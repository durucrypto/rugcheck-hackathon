require("dotenv").config();

const axios = require("axios");
const dedent = require("dedent");

const { TwitterApi } = require("twitter-api-v2");
const client = new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_KEY_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
});

let writeAccess;
let userId = process.env.X_USER_ID;
let updateTimestamp = new Date().toISOString(); // will be used to store the latest mention's timestamp

const openAI = require("openai");
const openai = new openAI(process.env.OPENAI_API_KEY);

/******************************************************************************************/

// fetch upvote and downvote counts for a given token address
async function getTokenVotes(tokenAddress) {
    try {
        const response = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/votes`);

        const { up, down } = response.data;

        const result = `\nToken's Upvote Count: ${up}\nToken's Downvote Count: ${down}`;
        return result;

    } catch(error) {
        console.error(error);
    }
}

// format large numbers into a readable string with units
function formatBigNumber(num, prefix) {
    if (num) {
        if (num >= 1e12) { return `${prefix}${(num / 1e12).toFixed(1)}T`; } // Convert to trillions
        else if (num >= 1e9) { return `${prefix}${(num / 1e9).toFixed(1)}B`; } // Convert to billions
        else if (num >= 1e6) { return `${prefix}${(num / 1e6).toFixed(1)}M`; } // Convert to millions
        else if (num >= 1e3 || num >= 1e2) { return `${prefix}${(num / 1e3).toFixed(1)}K`; } // Convert to thousands
        else { return (prefix + num); }
    }

    return "";
}

// fetch token summary for a given token address
async function getTokenSummary(tokenAddress) {
    try {
        const response = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`);

        const token = response.data;

        let result = "";

        let tokenDecimals;
        let tokenSupply;

        let totalInsiderAmount = 0; // total number of tokens held by insiders
        let totalAccountCount = 0; // total number of accounts controlled by insiders

        if (token.mint) {
            result += `Token CA: ${token.mint}`;
            result += `\nRugcheck Link: https://rugcheck.xyz/tokens/${token.mint}`;
        }

        if (token.tokenMeta && token.tokenMeta.symbol) {
            result += `\nToken Symbol: ${token.tokenMeta.symbol}`;
        }

        if (token.detectedAt) {
            result += `\nDetected by Rugcheck at: ${token.detectedAt}`;
        }

        if (token.verification) {
            result += "\nVerified on Rugcheck: Yes";

            if (token.verification.description) {
                result += `\nToken/Project Description: ${token.verification.description}`;
            }

            for (link of token.verification.links) {
                if (link.provider === "x") {
                    result += `\nX(Twitter) Link: ${link.value}`;

                } else if (link.provider === "telegram") {
                    result += `\nTelegram Link: ${link.value}`;

                } else if (link.provider === "website") {
                    result += `\nWebsite Link: ${link.value}`;
                }
            }
        }

        result += `\nToken Freezable?: ${!token.freezeAuthority ? "No" : "Yes"}`;
        result += `\nToken Mintable?: ${!token.mintAuthority ? "No" : "Yes"}`;

        if (token.token && token.token.decimals && token.token.supply) {
            tokenDecimals = token.token.decimals;
            tokenSupply = Math.round(token.token.supply / (10 ** tokenDecimals));

            result += `\nToken Supply: ${formatBigNumber(tokenSupply, "")}`;

            if (token.price) {
                result += `\nToken Price: $${token.price}}`;
                result += `\nToken Market Cap: ${formatBigNumber(token.price * tokenSupply, "$")}`;
            }
        }

        if (token.creator) {
            result += `\nToken Creator: ${token.creator}`;
        }

        if (token.creatorBalance != null && tokenDecimals && tokenSupply) {
            const creatorBalance = Math.round(token.creatorBalance / (10 ** tokenDecimals));
            const creatorSupplyPct = 100 * creatorBalance / tokenSupply;
            result += `\nToken Creator's Current Balance: ${formatBigNumber(creatorBalance, "")} (${creatorSupplyPct.toFixed(1)}% of the supply)`;
        }

        if (token.score != null) {
            result += `\nToken's Risk Score: ${token.score}`;
        }

        if (token.score_normalised != null) {
            result += `\nToken's Normalized Risk Score: ${token.score_normalised}`;
        }

        if (token.risks.length > 0) {
            result += `\nAssociated Risks with the Token:`;

            for (let i = 0; i < token.risks.length; i++) {
                result += `\nRisk-${i + 1}: ${token.risks[i].description} (Risk level: ${token.risks[i].level})`;
            }
        }

        if (token.rugged) {
            result += "\nNOTICE: THIS TOKEN HAS BEEN MARKED AS A RUG PULL!";
        }

        if (token.topHolders.length > 0) {
            let top10HoldersPct = 0;
            let top10InsiderPct = 0;
            
            let top20HoldersPct = 0;
            let top20InsiderPct = 0;

            token.topHolders.forEach((holder, i) => {
                if (i < 10) {
                    top10HoldersPct += holder.pct;
                    if (holder.insider) { top10InsiderPct += holder.pct; }
                }
            
                if (i < 20) {
                    top20HoldersPct += holder.pct;
                    if (holder.insider) { top20InsiderPct += holder.pct; }
                }
            });

            top10InsiderPct = 100 * top10InsiderPct / top10HoldersPct;
            top20InsiderPct = 100 * top20InsiderPct / top20HoldersPct;

            result += `\nTop 10 Holders' Supply Pct: ${top10HoldersPct.toFixed(1)}% (${top10InsiderPct.toFixed(1)}% of which are insiders)`;
            result += `\nTop 20 Holders' Supply Pct: ${top20HoldersPct.toFixed(1)}% (${top20InsiderPct.toFixed(1)}% of which are insiders)`;
        }

        if (token.markets.length > 0) {
            let lockedLiq = 0;
            let totalLiq = 0;

            for (let i = 0; i < token.markets.length; i++) {
                lockedLiq += token.markets[i].lp.lpLockedUSD || 0;
                totalLiq += (token.markets[i].lp.quoteUSD + token.markets[i].lp.baseUSD) || 0;
            }

            if (totalLiq === 0 && token.totalMarketLiquidity > 0) {
                totalLiq = token.totalMarketLiquidity;
            }

            if (totalLiq > 0) {
                const lockedLiqPct = 100 * lockedLiq / totalLiq;
                result += `\nTotal Liquidity: ${formatBigNumber(totalLiq, "$")} (${lockedLiqPct.toFixed(1)}% of which is locked)`;
            }
        }

        if (token.totalLPProviders != null) {
            result += `\nLP Provider Count: ${token.totalLPProviders}`;
        }

        if (token.totalHolders != null) {
            result += `\nToken Holder Count: ${token.totalHolders}`;
        }

        if (token.transferFee && token.transferFee.pct != null) {
            result += `\nToken Transfer Fee Pct(Tax): ${token.transferFee.pct}%`;
        }

        if (token.graphInsidersDetected != null) {
            result += `\nNumber of Graph Insiders Detected: ${token.graphInsidersDetected}`;
        }

        if (token.insiderNetworks.length > 0 && tokenDecimals && tokenSupply) {
            result += `\nInsider Networks:`;

            for (let i = 0; i < token.insiderNetworks.length; i++) {
                const insiderAmount = Math.round(token.insiderNetworks[i].tokenAmount / (10 ** tokenDecimals)) || 0;
                const accountCount = token.insiderNetworks[i].activeAccounts || 0;

                totalInsiderAmount += insiderAmount;
                totalAccountCount += accountCount;

                result += `\nCluster-${i + 1}: Token Amount: ${formatBigNumber(insiderAmount, "")} | Active Account Count: ${formatBigNumber(accountCount, "")}`;
            }
        }

        if (tokenSupply) {
            result += `\nTotal Supply Pct Held by Insider Networks: ${(100 * totalInsiderAmount / tokenSupply).toFixed(1)}%`;
        }

        result += `\nTotal Number of Wallets Connected to Insider Networks: ${totalAccountCount}`;

        return result;

    } catch(error) {
        console.error(error);
    }
}

/******************************************************************************************/

// fetch recently verified tokens from Rugcheck
async function getVerifiedTokens() {
    try {
        const response = await axios.get("https://api.rugcheck.xyz/v1/stats/verified");

        const tokens = response.data.map(token => {
            return (
                `\nToken CA: ${token.mint}` +
                `\nToken Symbol: ${token.symbol}` +
                `\nToken Description: ${token.description}` +
                `\nVerified on Jupiter: ${token.jup_verified || token.jup_strict ? "Yes" : "No"}`
            );
        });

        if (tokens.length > 0) {
            const result = "Here are the recently verified tokens on Rugcheck:\n\n" + tokens.join("\n---\n") + "\n\n";
            return result;
        }

    } catch(error) {
        console.error(error);
    }
}

// fetch most voted tokens in the past 24 hours from Rugcheck
async function getTrendingTokens() {
    try {
        const response = await axios.get("https://api.rugcheck.xyz/v1/stats/trending");

        const tokens = response.data.map(token => {
            return (
                `Token CA: ${token.mint}` +
                `\nUpvote Count: ${token.up_count}` +
                `\nDownvote Count: ${token.vote_count - token.up_count}`
            );
        });

        if (tokens.length > 0) {
            const result = "Here are the trending/most voted for tokens on Rugcheck in the last 24 hours:\n\n" + tokens.join("\n---\n") + "\n\n";
            return result;
        }

    } catch(error) {
        console.error(error);
    }
}

// fetch most viewed tokens in the past 24 hours from Rugcheck
async function getMostViewedTokens() {
    try {
        const response = await axios.get("https://api.rugcheck.xyz/v1/stats/recent");

        const tokens = response.data.map(token => {
            return (
                `Token CA: ${token.mint}` +
                `\nToken Symbol: ${token.metadata.symbol}` +
                `\nPage Visit Count: ${token.visits}`
            );
        });

        if (tokens.length > 0) {
            const result = "Here are the most viewed tokens on Rugcheck in the last 24 hours:\n\n" + tokens.join("\n---\n") + "\n\n";
            return result;
        }

    } catch(error) {
        console.error(error);
    }
}

// fetch recently detected tokens from Rugcheck
async function getNewTokens() {
    try {
        const response = await axios.get("https://api.rugcheck.xyz/v1/stats/new_tokens");

        const tokens = response.data.filter(token => !token.mintAuthority && !token.freezeAuthority) // exclude tokens with mint or freeze authority
        .map(token => {
            return (
                `Token CA: ${token.mint}` +
                `\nToken Symbol: ${token.symbol}` +
                `\nCreator Addr: ${token.creator}` +
                `\nCreated At: ${token.createAt}`
            );
        });

        if (tokens.length > 0) {
            const result = "Here are the recently detected tokens on Rugcheck:\n\n" + tokens.join("\n---\n") + "\n\n";
            return result;
        }

        return "Couldn't find any new tokens without mint+freeze authority.\n\n";

    } catch(error) {
        console.error(error);
    }
}

/******************************************************************************************/

async function postReply(message, mentionId) {
    try {
        const postedReply = await writeAccess.v2.tweet({
            text: message,
            reply: {
                in_reply_to_tweet_id: mentionId,
            },
        });

        console.log("Posted tweet's id:", postedReply.data.id);

    } catch(error) {
        console.log(error);
    }
}

async function getOpenAIResponse(context) {
    try {
        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: dedent(context) }],
            model: "gpt-4o",
            temperature: 0,
            max_tokens: 1000,
            top_p: 0.6,
            frequency_penalty: 0,
            presence_penalty: 0,
        });

        const answer = completion.choices[0].message.content;
        return answer;

    } catch(error) {
        console.error(error);
    }
}

async function replyToMention(mentionText, mentionId, parentTweetText) {
    try {
        let twitterContext = "";
        let tokenContext = "";

        if (parentTweetText) {
            twitterContext += `A user posted the following tweet: ${parentTweetText}. Another user responded, mentioning your X account: ${mentionText}.\n`;
        } else {
            twitterContext += `A user posted a tweet mentioning your X account: ${mentionText}.\n`;
        }

        const firstInstruction = twitterContext + `
            Your task is to analyze the content based on the following references:
            -Check if the tweet(s) mentions a specific token address, token ticker or token name.
            -If a token address is mentioned, return the token address. If only the token name or ticker is mentioned/implied, return the token name or ticker.
            -If the tweet(s) contains a general question about tokens (e.g., most viewed tokens, trending tokens, tokens on Rugcheck), return "general_query".
            -If none of the above applies, return "null".

            Expected output:
            A token address (if available), a token name or ticker, "general_query" (for token-related general questions), or "null" (if no relevant content is found).
        `;

        const firstResponse = await getOpenAIResponse(firstInstruction);
        if (!firstResponse) { throw new Error("No response received from OpenAI."); }

        if (firstResponse === "general_query" || firstResponse === '"general_query"') {
            const secondInstruction = twitterContext + `
                Your task is to categorize the content based on the following references:
                -If it's about new tokens, add 0 to the array.
                -If it's about the most viewed tokens, add 1 to the array.
                -If it's about trending/most voted tokens, add 2 to the array.
                -If it's about recently verified tokens, add 3 to the array.
                -If none of the above, return an empty array.

                Expected output:
                An array with one or more numbers (0, 1, 2, or 3) or an empty array if no category applies.
            `;

            let secondResponse = await getOpenAIResponse(secondInstruction);
            if (!secondResponse) { throw new Error("No response received from OpenAI."); }

            secondResponse = JSON.parse(secondResponse);

            if (secondResponse.includes(0) || secondResponse.includes("0")) {
                tokenContext += await getNewTokens() || "";
            }
            
            if (secondResponse.includes(1) || secondResponse.includes("1")) {
                tokenContext += await getMostViewedTokens() || "";
            }
            
            if (secondResponse.includes(2) || secondResponse.includes("2")) {
                tokenContext += await getTrendingTokens() || "";
            }
            
            if (secondResponse.includes(3) || secondResponse.includes("3")) {
                tokenContext += await getVerifiedTokens() || "";
            }

        } else if (firstResponse !== "null" && firstResponse !== '"null"') {
            let tokenAddress;
            const dsResponse = await axios.get(`https://api.dexscreener.com/latest/dex/search?q=${firstResponse}`); // this is more flexible, supporting token/pool CAs and token tickers/names

            for (const pair of dsResponse.data.pairs) {
                if (pair.chainId === "solana") { // check for token on Solana chain
                    tokenAddress = pair.baseToken.address; // set the token address if matched
                    break;
                }
            }

            if (tokenAddress) {
                tokenContext += (await Promise.all([
                    getTokenSummary(tokenAddress) || "",
                    getTokenVotes(tokenAddress) || ""
                ])).join("");

            } else {
                console.log("Couldn't find the token.");
            }
        }

        if (tokenContext) {
            const thirdInstruction = twitterContext + `
                Using the information below(from Rugcheck), answer the question/request above.
                Make sure your response is very short and fits within a single tweet due to the character limit on X. Don't offer further help.
                If the provided information is insufficient, return "null".
                Expected output: either an answer or "null".\n
                ${tokenContext}
            `;

            const thirdResponse = await getOpenAIResponse(thirdInstruction);
            if (!thirdResponse) { throw new Error("No response received from OpenAI."); }

            if (thirdResponse !== "null" && thirdResponse !== '"null"') {
                await postReply(thirdResponse, mentionId);
                return;
            }
        }

        // the instruction is isolated here so the bot gives a safe, generic reply in case of inappropriate requests or wording.
        const fourthInstruction = "Someone mentioned you in a tweet with a request/question. Assume you are unable to assist them and write a very short response."; 

        const fourthResponse = await getOpenAIResponse(fourthInstruction);
        if (!fourthResponse) { throw new Error("No response received from OpenAI."); }

        await postReply(fourthResponse, mentionId);

    } catch(error) {
        console.error(error);
    }
}

/******************************************************************************************/

async function getMentions() {
    try {
        const tweets = await client.v2.userMentionTimeline(userId, {
            "tweet.fields": ["created_at", "author_id", "referenced_tweets", "text"],
            //max_results: 10,
            start_time: updateTimestamp,
        });

        if (tweets && tweets.data && tweets.data.data) {
            const mentions = tweets.data.data;

            if (mentions.length > 0) {
                const latestMentionTime = new Date(mentions[0].created_at).getTime();
                updateTimestamp = new Date(latestMentionTime + 1000).toISOString(); // set timestamp to latest mention’s time + 1s buffer to avoid overlap
            }

            const results = [];

            for (let mention of mentions) {
                const mentionObj = {
                    mentionText: mention.text,
                    mentionId: mention.id
                };

                // if the mention is a reply, try to fetch the parent tweet
                if (mention.referenced_tweets) {
                    const replyRef = mention.referenced_tweets.find(ref => ref.type === "replied_to");

                    if (replyRef) {
                        try {
                            const parentTweet = await client.v2.singleTweet(replyRef.id, {
                                "tweet.fields": ["text"]
                            });

                            mentionObj.parentTweetText = parentTweet.data.text;

                        } catch(error) {
                            console.log(error);
                        }
                    }
                }

                results.push(mentionObj);
            }

            return results;
        }

    } catch(error) {
        console.error(error);
    }
}

async function replyToMentions() {
    try {
        const mentions = await getMentions() || [];

        if (mentions.length === 0) {
            console.log(`No new mentions to respond to. (${updateTimestamp})`);
            return;
        }

        for (const mention of mentions) {
            await replyToMention(mention.mentionText, mention.mentionId, mention.parentTweetText);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

    } catch(error) {
        console.error(error);
    }
}

/******************************************************************************************/

async function checkCredentials() {
    try {
        const user = await client.v1.verifyCredentials();
        return !!user;

    } catch(error) {
        console.error(error);
    }
}

async function getUserId() {
    try {
        const me = await client.v2.me();
        console.log("Here’s your X account’s user ID, in case you want to update the .env file:", me.data.id);
        return me.data.id;

    } catch(error) {
        console.error(error);
    }
}

/******************************************************************************************/

async function main() {
    try {
        if (!userId) { // fetch X account's user ID if not already set
            userId = await getUserId();

            if (!userId) {
                throw new Error("The X account’s user ID couldn’t be retrieved. Please double-check the credentials.");
            }
        }

        const isAuthenticated = await checkCredentials();

        if (isAuthenticated) {
            writeAccess = client.readWrite; // enable read/write access

            replyToMentions();

            setInterval(() => {
                replyToMentions();
            }, 1 * 60 * 1000); // trigger recursive call after 5m timeout
        }

    } catch(error) {
        console.error(error);
    }
}

main();
