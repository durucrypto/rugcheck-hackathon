# RugCheck AI Agent on X

An AI agent built for RugCheck that:
- Listens to mentions on X (formerly Twitter),
- Analyzes the context of the request or question,
- Leverages RugCheck's API to fetch relevant data,
- Responds with clear, everyday language using OpenAI's API.

## 🔍 Token-Specific Information & Endpoints Used:

1. [Token Report](https://api.rugcheck.xyz/swagger/index.html#/Tokens/get_tokens__id__report) - Fetches detailed information about a specific token.
2. [Token Votes](https://api.rugcheck.xyz/swagger/index.html#/Votes/get_tokens__id__votes) - Retrieves voting data for a specific token.

## 🌐 General Information & Endpoints Used:

3. [Recently Detected/New Tokens](https://api.rugcheck.xyz/swagger/index.html#/Stats/get_stats_new_tokens)
4. [Most Viewed Tokens (last 24h)](https://api.rugcheck.xyz/swagger/index.html#/Stats/get_stats_recent)
5. [Most Voted/Trending Tokens](https://api.rugcheck.xyz/swagger/index.html#/Stats/get_stats_trending)
6. [Recently Verified Tokens](https://api.rugcheck.xyz/swagger/index.html#/Stats/get_stats_verified)
   
## 💡 Additional Features

- The agent analyzes and categorizes the request/question to avoid unnecessary API calls and AI hallucination for more accurate responses.
- If available, it pulls the parent tweet to provide additional context.
- For unrelated questions, it gives a safe, generic reply in case of inappropriate requests or wording.

## ⚙️ Setup Instructions

1. Clone the repository:

    ```bash
    git clone https://github.com/durucrypto/rugcheck-hackathon.git
    ```

2. Change the directory:

    ```bash
    cd rugcheck-hackathon
    ```

3. Install dependencies:

    ```bash
    npm install
    ```

4. Create your `.env` file:

    ```bash
    cp sample.env .env
    ```

    Then open `.env` and add your config values.

5. Start the bot:

    ```bash
    npm start
    ```

    Or, if you prefer:

    ```bash
    node rugcheckBot.js
    ```
