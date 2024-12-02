import express, { text } from "express";
import axios from "axios";
import dotenv from 'dotenv';
import redis from 'redis';

dotenv.config();
const redisClient = redis.createClient();
redisClient.on('error', (err) => {
  console.error('Error connecting to Redis:', err);
});

(async () => {
  await redisClient.connect();
})();

const app = express();
app.use(express.json());

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN, PORT, OKTO_TOKEN } = process.env;
console.log('Okta token', OKTO_TOKEN);
const userTokenId = "eyJhbGciOiJSUzI1NiIsImtpZCI6IjM2MjgyNTg2MDExMTNlNjU3NmE0NTMzNzM2NWZlOGI4OTczZDE2NzEiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiI0MDc0MDg3MTgxOTIuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiI0MDc0MDg3MTgxOTIuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJzdWIiOiIxMDY4MTgxMjYyODA5MTk5ODU0NzMiLCJlbWFpbCI6InNheWFua2FyMTMwOEBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiYXRfaGFzaCI6InpmT1JqQ3VUWDJwMFpIV0c4RW9feFEiLCJpYXQiOjE3MzMxMDAxMTIsImV4cCI6MTczMzEwMzcxMn0.akAmLCM73t1WSPbNRiRw12sVrk4q1CH5xTD8MyqnfFk3Q_NNROMQFfv9dKB2dzwX2aKAdsYUYnfJ3pXg0S2u7v4xe37tmZUoLOgY9jNCdYXq6Ca3cDOu0WWNbcPy1gxCyQWUY6qJ0pwZiHMGhcxLoGxkI0CO3fBJL_lZwveCk8SxS3fusmdnlzBal3KuciJmKqEZZnuDfANoKrwErCY8xRJuX9PmemXZa0TKwDwgfb6R0LxaAvfpXE2Wf13ZBXF2pOnCbaacqIDkVeuC55O4yRD26ReN-y5ZgfmGQPQp3vIin6T01uxeZQDL1sYwLxhrDA04G_bRYUrLv0SPNkvRpA";

async function authenticateWithOkto(id_token) {
  const options = {
    method: 'POST',
    url: 'https://sandbox-api.okto.tech/api/v2/authenticate',
    headers: {
        'accept': '*/*',
        'content-type': 'application/json',
        'x-api-key': OKTO_TOKEN, // Replace with your actual API key
    },
    data: {
        'id_token': id_token,
    },
};
  console.log('options', options);
  try {
    const response = await axios.request(options);
    console.log('authentication response', response);
    return response;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function formatWalletsMessage(jsonData) {
  const wallets = jsonData.data.wallets;
  let message = "*Wallet Details:*\n\n";

  wallets.forEach((wallet, index) => {
    message += `${index + 1}. *Network Name:* ${wallet.network_name}\n`;
    message += `   *Address:* ${wallet.address}\n`;
    message += `   *Status:* ${wallet.success ? "✅ Success" : "❌ Failed"}\n\n`;
  });

  return message.trim(); // Trim any extra newlines
}

async function process_msg(req) {
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const msg = message.text.body;
  if(msg === '/login') {
    const cache = await get_auth_token(message.from);
    if (cache) {
      console.log('Token retrieved from redis', cache);
      return await send_msg(req, 'User already authenticated');
    }
    const res = await authenticateWithOkto(userTokenId);
    const textMessage = res?.data?.data?.message === "success" ? "User authenticated" : "User not authenticated";
    console.log('/login', message.from, textMessage);
    await save_auth_token(message.from, res.data);
    res?.data?.data?.message === "success" && await send_msg(req, textMessage);
  }
  if(msg === '/get_wallets') {
    const wallets = await getWallets(req);
    if (!wallets) {
      return await send_msg(req, 'Something went wrong, please try again.\n Make sure you have enabled networks and created wallets.');
    }
    console.log('/get_wallets', message.from, wallets);
    await send_msg(req, formatWalletsMessage(wallets));
  }
  if(msg === '/create_wallet') {
    const wallet = await create_wallet(req);
    if (!wallet) {
      return await send_msg(req, 'Something went wrong, please try again.\n Make sure you have enabled networks.');
    }
    console.log('/create_wallet', message.from, wallet);
    await send_msg(req, `Wallet created successfully:\n\n ${formatWalletsMessage(wallet)}`);
  }
  if(msg === '/get_portfolio') {
    const portfolio = await get_portfolio(req);
    if (!portfolio) {
      return await send_msg(req, 'Something went wrong, please try again.\n Make sure you have created wallets.');
    }
    console.log('/get_portfolio', message.from, portfolio);
    await send_msg(req, formatTokensMessage(portfolio));
  }

  const transferRegex = /^\/transfer\s+([A-Za-z0-9_-]+)\s+([0-9.]+)\s+([A-Za-z0-9_-]+)\s*(?:([0-9a-fA-F]{40}))?$/;
  ;
  const transferMatch = msg.match(transferRegex);
  if (transferMatch) {
    // Extract matched values
    const network_name = transferMatch[1];    // 'Ethereum'
    const quantity = transferMatch[2];        // '51.1233'
    const recipient_address = transferMatch[3]; // '0xa845e8f79e8848600540dd39eb766ad127b90bb5836a23ed0786ef22fb8a9d54'
    const token_address = transferMatch[4] || null;
    const transferData = await transfer(req, network_name, token_address, quantity, recipient_address);
    if (!transferData) {
      return await send_msg(req, 'Something went wrong, please try again.');
    }
    console.log('/transfer', message.from, transferData);
    await send_msg(req, `Transfer order created successfully.\n OrderId: \n\n${JSON.stringify(transferData.data.orderId, null, 2)}`);
  }

  const orderStatysRegex = /^\/get_order_status(\s+([a-fA-F0-9\-]{36}))?$/;
  const orderStatusMatch = msg.match(orderStatysRegex);
  console.log('orderStatusMatch', JSON.stringify(orderStatusMatch));
  if (orderStatusMatch) {
    const orderId = orderStatusMatch[1] || null;
    const orderStatus = await getOrderStatus(req, orderId);
    if (!orderStatus) {
      return await send_msg(req, 'Something went wrong, please try again.');
    }
    console.log('/get_order_status', message.from, orderStatus);
    await send_msg(req, parseJobStatus(orderStatus));
  }

  if(msg === '/logout') {
    await logout(req);
  }


}

function parseJobStatus(jsonData) {
  const { status, data } = jsonData;

  if (status === "success" && data?.jobs?.length > 0) {
    let formattedMessage = "Job Status Updates:\n\n";

    data.jobs.forEach((job) => {
      const { order_id, order_type, network_name, status: jobStatus, transaction_hash, created_at, updated_at } = job;
      
      formattedMessage += `
        Order ID: ${order_id}
        Order Type: ${order_type}
        Network: ${network_name}
        Status: ${jobStatus}
        Transaction Hash: ${transaction_hash}
        Created At: ${created_at}
        Updated At: ${updated_at}
        -----------------------
      `;
    });

    return formattedMessage.trim();
  }

  return "No job data available or status is not success.";
}

async function getOrderStatus(req, orderId) {
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const user = message.from;
  const cache = await get_auth_token(user);
  if (!cache) {
    return await send_msg(req, 'User not authenticated, login first.');
  }
  console.log('Cache value', user, cache);
  const authToken = cache.data.auth_token;
  const options = {
    method: 'GET',
    url: `https://sandbox-api.okto.tech/api/v1/orders${orderId ? `?order_id=${orderId}` : ''}`,
    headers: {Authorization: `Bearer ${authToken}`}
  };
  try {
    const { data } = await axios.request(options);
    console.log(data);
    return data;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function transfer(req, network_name, token_address, quantity, recipient_address) {
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
    const user = message.from;
  const cache = await get_auth_token(user);
  if (!cache) {
    return await send_msg(req, 'User not authenticated, login first.');
  }
  console.log('Cache value', user, cache);
  const authToken = cache.data.auth_token;
  const options = {
    method: 'POST',
    url: 'https://sandbox-api.okto.tech/api/v1/transfer/tokens/execute',
    headers: {Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json'},
    data: {
      network_name: network_name,
      token_address: token_address ?? '',
      quantity: quantity,
      recipient_address: recipient_address
    }
  };
  
  try {
    const { data } = await axios.request(options);
    console.log(data);
    return data;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function getWallets(req) {
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
    const user = message.from;
  const cache = await get_auth_token(user);
  if (!cache) {
    return await send_msg(req, 'User not authenticated, login first.');
  }
  console.log('Cache value', user, cache);
  const authToken = cache.data.auth_token;

  const options = {
    method: 'GET',
    url: 'https://sandbox-api.okto.tech/api/v1/wallet',
    headers: {Authorization: `Bearer ${authToken}`}
  };

  try {
    const { data } = await axios.request(options);
    console.log(data);
    return data;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function formatTokensMessage(jsonData) {
  const tokens = jsonData.data.tokens;
  let message = "*Portfolio Details:*\n\n";
  
  message += `Total Tokens: *${jsonData.data.total}*\n\n`;

  tokens.forEach((token, index) => {
    message += `${index + 1}. *Token Name:* ${token.token_name}\n`;
    message += `   *Quantity:* ${token.quantity}\n`;
    message += `   *Amount (INR):* ₹${token.amount_in_inr}\n`;
    message += `   *Network Name:* ${token.network_name}\n`;
    message += `   *Token Address:* ${token.token_address}\n`;
    message += `   *Token Image:* ${token.token_image ? token.token_image : "No image available"}\n\n`;
  });

  if (tokens.length === 0) {
    message += "No tokens found in the portfolio.";
  }

  return message.trim(); // Trim any extra newlines
}

async function create_wallet(req) {
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
    const user = message.from;
  const cache = await get_auth_token(user);
  if (!cache) {
    return await send_msg(req, 'User not authenticated, login first.');
  }
  console.log('Cache value', user, cache);
  const authToken = cache.data.auth_token;
  const options = {
    method: 'POST',
    url: 'https://sandbox-api.okto.tech/api/v1/wallet',
    headers: {Authorization: `Bearer ${authToken}`}
  };
  
  try {
    const { data } = await axios.request(options);
    console.log(data);
    return data;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function get_portfolio(req) {
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
    const user = message.from;
  const cache = await get_auth_token(user);
  if (!cache) {
    return await send_msg(req, 'User not authenticated, login first.');
  }
  console.log('Cache value', user, cache);
  const authToken = cache.data.auth_token;

  const options = {
    method: 'GET',
    url: 'https://sandbox-api.okto.tech/api/v1/portfolio',
    headers: {Authorization: `Bearer ${authToken}`}
  };

  try {
    const { data } = await axios.request(options);
    console.log(data);
    return data;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function save_auth_token(key, value) {
  if (typeof key !== 'string' || typeof value !== 'string') {
    key = String(key);
    value = JSON.stringify(value); // Convert value to a string
  }
  console.log(typeof key, typeof value)
  await redisClient.set(key, value);
  console.log('Token saved to redis', key, value);
}

async function get_auth_token(key) {
  try {
    const value = await redisClient.get(key);
    if (value) {
        return JSON.parse(value);
    }
    return null; 
  } catch (error) {
      console.error('Error retrieving token from Redis:', error);
      throw error;
  }
}

async function logout(req) {
  try {
    const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
    const user = message.from;
    const cache = await get_auth_token(user);
    if (!cache) {
      return await send_msg(req, 'User not authenticated, login first.');
    }
    const authToken = cache.data.auth_token;
    const options = {
      method: 'POST',
      url: 'https://sandbox-api.okto.tech/api/v1/logout',
      headers: {Authorization: `Bearer ${authToken}`}
    };
    
    try {
      const { data } = await axios.request(options);
      console.log(data);
    } catch (error) {
      console.error(error);
    }
    await redisClient.del(user);
    console.log('User logged out successfully.', user);
    await send_msg(req, 'User logged out successfully.');
  } catch (error) {
    console.error('Error logging out user:', error);
    await send_msg(req, 'Something went wrong, please try again.');
  }
}

async function send_msg(req, textMessage) {
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const business_phone_number_id =
  req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;
  await axios({
    method: "POST",
    url: `https://graph.facebook.com/v18.0/${business_phone_number_id}/messages`,
    headers: {
      Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    },
    data: {
      messaging_product: "whatsapp",
      to: message.from,
      text: { body: textMessage },
      context: {
        message_id: message.id, // shows the message as a reply to the original user message
      },
    },
  });
}

async function markAsRead(req) {
  // extract the business number to send the reply from it
  const business_phone_number_id =
  req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];

  await axios({
    method: "POST",
    url: `https://graph.facebook.com/v18.0/${business_phone_number_id}/messages`,
    headers: {
      Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    },
    data: {
      messaging_product: "whatsapp",
      status: "read",
      message_id: message.id,
    },
  });
}

app.post("/webhook", async (req, res) => {
  // log incoming messages
  console.log("Incoming webhook message:", JSON.stringify(req.body, null, 2));

  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];

  // check if the incoming message contains text
  if (message?.type === "text") {
  
    markAsRead(req); // mark the message as read

    // send a reply message as per the docs here https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
    process_msg(req);    
  }

  res.sendStatus(200);
});

// accepts GET requests at the /webhook endpoint. You need this URL to setup webhook initially.
// info on verification request payload: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // check the mode and token sent are correct
  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    // respond with 200 OK and challenge token from the request
    res.status(200).send(challenge);
    console.log("Webhook verified successfully!");
  } else {
    // respond with '403 Forbidden' if verify tokens do not match
    res.sendStatus(403);
  }
});

app.get("/", (req, res) => {
  res.send(`<pre>Nothing to see here.
Checkout README.md to start.</pre>`);
});

app.listen(PORT, () => {
  console.log(`Server is listening on port: ${PORT}`);
});
