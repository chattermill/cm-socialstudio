require('dotenv').config()

const express = require('express');
const app = express();
const rollbar = require("rollbar");
rollbar.init(process.env.ROLLBAR_TOKEN);
const redirect_uri = `${process.env.URL}/callback`;
const scope = 'OOB';
const state = process.env.SECRET;
const client_id = process.env.SOCIALSTUDIO_OAUTH_CLIENT_ID;
const client_secret = process.env.SOCIALSTUDIO_OAUTH_CLIENT_SECRET;
const grant_type = 'authorization_code';
const Slack = require('node-slack');
const slack = new Slack(process.env.SLACK_WEHOOK_URL);
const Logger = require('logdna');

const logdnaOptions = {
  hostname: 'socialstudio-integration.chattermill.io',
  app: 'cm-socialstudio',
  env: 'production'
};

const logger = Logger.setupDefaultLogger(process.env.LOGDNA_KEY, logdnaOptions);

const credentials = {
  client: {
    id: client_id,
    secret: client_secret
  },
  auth: {
    tokenHost: 'https://api.socialstudio.radian6.com/login',
    tokenPath: '/oauth/token',
    authorizeHost: 'https://api.socialstudio.radian6.com',
    authorizePath: '/oauth/authorize'
  }
};

const oauth2 = require('simple-oauth2').create(credentials);

const authorizationUri = oauth2.authorizationCode.authorizeURL({
  redirect_uri,
  scope,
  state
});


app.use(express.static('public', { maxAge: 0 }));
app.use(rollbar.errorHandler({environment: 'production'}));

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", (request, response) => response.sendFile(__dirname + '/views/index.html'));


app.get('/auth', (req, res) => {
  res.redirect(authorizationUri);
});

app.get('/callback', (req, res) => {
  console.log("Req:", req)
  const code = req.query.code;
  const options = {
    client_id,
    client_secret,
    code,
    redirect_uri,
    grant_type
  };

  oauth2.authorizationCode.getToken(options)
  .then((result) => {
    const token = oauth2.accessToken.create(result);

    console.log(token);
    logger.log(token);

    slack.send({
      text: `SocialStudio Authentication Token received: ${JSON.stringify(token)}`,
      channel: '#tokens',
      username: 'SocialStudio'
    });

    return res
      .status(200)
      .redirect('/success');
  })
  .catch((error) => {
    logger.log('Access Token Error', error.message);
    console.log('Access Token Error', error.message);
    console.error(error.stack);
    return res.json('Authentication failed');
  });
});

app.get('/success', (request, response) => response.sendFile(__dirname + '/views/success.html'));

const listener = app.listen(process.env.PORT, () => console.log('Your app is listening on port ' + listener.address().port));
