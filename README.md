# Whatsapp-Wallet

Whatsapp Wallet allows you to create and manage embedded wallet from your whatsapp app! Users can view their token balance and transfer funds right from their whatsapp.

## Get started

Message our bot [here](https://wa.me/+918982287115)

### Commands

1. `/login`

2. `/create_wallet`  
It creates an embedded wallet linked to your google account.

3. `/get_wallets`  
It returns all the associated accounts stored in your wallet.

4. `/get_portfolio`  
It returns the balance of your accounts in the wallet.

5. `/transfer <NETWORK> <AMOUNT> <TO> <?TOKEN>`
Transfer tokens

`<NETWORK>`: Mention the network (e.g. BASE, )
`<AMOUNT>`: Number of tokens to transfer
`TO`: Receipient address
`<?TOKEN>`: (optional) To transfer non-native token, Pass token address 

6. `/logout`

## Demo link

https://youtu.be/_vnWc3E23X4

## Run on Local

This is an example server that integrates with the WhatsApp Business API to handle webhooks. It is designed to handle messages and notifications for a WhatsApp-based wallet application.

### Prerequisites

- Node.js version 16 or higher
- A WhatsApp Business Account and an associated Graph API token
- Redis for storing temporary data (optional)

### Setup Instructions

1. **Clone the repository**:

   ```bash
   git clone https://your-repository-url.git
   cd whatsapp-crypto-exchange
   ```
2. **Install dependencies**:

    Make sure you have the required dependencies by running:

    ```bash
    npm install
    ```
3. **Configure environment variables**:

    Create a .env file in the root directory of your project and set the following environment variables:

    ```env
    PORT=3000
    GRAPH_API_TOKEN=<your-whatsapp-business-graph-api-token>
    WEBHOOK_VERIFY_TOKEN=<your-webhook-verify-token>
    OKTO_TOKEN=<your-okto-token>
    REDIRECT_URI=http://localhost:3000/
    BUSINESS_PHONE_NO_ID=<your-whatsapp-business-phone-number-id>
    ```

    PORT: Port where the server will listen (default: 3000).
    
    GRAPH_API_TOKEN: Your WhatsApp Business Account Graph API token.
    
    WEBHOOK_VERIFY_TOKEN: A secret token for verifying incoming webhook requests.
    
    OKTO_TOKEN: (Optional) Token for Okto integration if applicable.
    
    REDIRECT_URI: URL used for redirection, set this to your local or production URL.
    
    BUSINESS_PHONE_NO_ID: Your WhatsApp Business phone number ID.

4. Run the server:

    Start the server with the following command:

    ```bash
    npm start
    ```

## Team

* Sayan Kar
* Nimish Agrawal
* Pranjali Bhanage
