// Configuración global
console.log(`************************************************************************************************************************`);

function createSession() {
  console.log(`Function executed: createSession`);
  // Random Number Generator
  var randomNo = Math.floor(Math.random() * 1000 + 1);
  // get Timestamp
  var timestamp = Date.now();
  // get Day
  var date = new Date();
  var weekday = new Array(7);
  weekday[0] = "Sunday";
  weekday[1] = "Monday";
  weekday[2] = "Tuesday";
  weekday[3] = "Wednesday";
  weekday[4] = "Thursday";
  weekday[5] = "Friday";
  weekday[6] = "Saturday";
  var day = weekday[date.getDay()];
  // Join random number+day+timestamp
  var session_id = randomNo + day + timestamp;
  console.log(`Session ID: ${session_id}`);
  return session_id;
}

// object GLOBALS initiates in blank, and will be filled based on the product that is being used.
let globals = {
  TWILIO_ACCOUNT_SID: "AC762c0c7bcd2d90fc35f4917c6445e397",
  VOICEFLOW_VERSION_ID: "659f28896e8269a135ddc3cf",
  VOICEFLOW_API_KEY: "VF.DM.659f3367213c970007153034.04p2pQumxTYhGAux",
  TWILIO_PHONE_NUMBER: "+18556998467",
  TWILIO_AUTH_TOKEN: "cdf6a57fb5919b9e805f14b27e7aab72",
  VOICEFLOW_API_URL: "https://general-runtime.voiceflow.com",
  VOICEFLOW_PROJECT_ID: "659f28896e8269a135ddc3ce",
  VOICEFLOW_SESSION: `659f28896e8269a135ddc3cf.${createSession()}`
};

//Dependencies
require("dotenv").config();
const express = require("express");
const logger = require("morgan");
const bodyParser = require("body-parser");
const twilio = require("twilio");
const axios = require("axios");
const VoiceResponse = require('twilio').twiml.VoiceResponse;

// Functions



logTranscript = async (message) => {
  console.log(`Before change = ${message}`);
  const sheetid = "1XNbbvjnF8GCiDgls0FI0K3GfmoinOcwfcd5nlIRpgD4";
  const lambdaURL = "https://ytzivrzj76ejwc2vdbnzwladdm0nvubi.lambda-url.us-east-1.on.aws/";

  message =
    message.indexOf(`<?xml`) > -1
      ? `(Machine) ${message
        .substring(message.indexOf("<Say>"), message.lastIndexOf("</Say>"))
        .replace(/<Say>/g, "")
        .replace(/<Say\/>/g, "")
        .replace(/<\/Say>/g, "")}`
      : message;

  console.log(`After change, before call = ${message}`);

  axios({
    method: "post",
    url: lambdaURL,
    data: {
      sheetid: sheetid,
      message: message,
    },
  })
    .then(function(response) {
      console.log(`Message logged: ${message}`);
      console.log(
        `Logged in the following sheet: https://docs.google.com/spreadsheets/d/${sheetid}`);
    })
    .catch((err) => console.log(`------- ERROR (79): ${err}, Message: ${message}`));
};

async function interacting(called, caller, action) {
  console.log(`Function executed: interacting`);
  const twiml = new VoiceResponse();

  // call the Voiceflow API with the user's name & request, get back a response
  const request = {
    method: "POST",
    url: `https://general-runtime.voiceflow.com/state/user/${encodeURI(caller)}/interact`,
    headers: { Authorization: globals.VOICEFLOW_API_KEY, sessionid: globals.VOICEFLOW_SESSION },
    data: {
      action, //action: { "type": "text", "payload": "How do I turn on my computer?" },
      config: { stopTypes: ["DTMF"] },
      state: { variables: { calledParty: called, callingParty: caller } }
    },
  };

  // EXAMPLE OF PAYLOAD: https://developer.voiceflow.com/reference/stateinteract-1
  // {
  //   "action": { "type": "launch" },
  //   "config": {
  //     "tts": false,
  //     "stripSSML": true,
  //     "stopAll": true,
  //     "excludeTypes": [
  //       "block",
  //       "debug",
  //       "flow"
  //     ]
  //   },
  //   state: { variables: { calledParty: called, callingParty: caller }
  //   }
  // }


  const response = await axios(request);
  console.log(`>>> response = ${JSON.stringify(response)}`);
  // logTranscript(` >>> response = ${JSON.stringify(response)}`);

  // janky first pass
  const endTurn = response.data.some((trace) =>
    ["CALL", "end"].includes(trace.type),
  );

  let agent = endTurn
    ? twiml
    : twiml.gather({
      input: "speech dtmf",
      numDigits: 1,
      speechTimeout: "auto",
      action: "/ivr/interaction",
      profanityFilter: false,
      actionOnEmptyResult: true,
      method: "POST",
    });

  // loop through the response
  for (const trace of response.data) {
    switch (trace.type) {
      case "text":
      case "speak": {
        agent.say(trace.payload.message);
        break;
      }
      case "CALL": {
        const { number } = JSON.parse(trace.payload);
        console.log("Calling", number);
        twiml.dial(number);
        break;
      }
      case "SMS": {
        const { message } = JSON.parse(trace.payload);
        console.log(`Sending SMS -> ${message}, To (${caller}) From (${globals.TWILIO_PHONE_NUMBER})`);
        const SMS = require('twilio')(globals.TWILIO_ACCOUNT_SID, globals.TWILIO_AUTH_TOKEN); //This was previously on Line 20
        SMS.messages
          .create({
            body: message,
            to: caller,
            from: globals.TWILIO_PHONE_NUMBER,
          })
          .then((message) => {
            console.log("Message sent, SID:", message.sid);
          })
          .catch((error) => {
            console.error("Error sending message:", error);
          });
        saveTranscript(caller);
        break;
      }
      case "end": {
        console.log(`CASE END: Entering transcript`)
        saveTranscript(caller);
        twiml.hangup();
        break;
      }
      default: {
      }
    }
  }
  logTranscript(twiml.toString());
  return twiml.toString();
}

launch = async (called, caller) => {

  console.log(`*** Function executed: launch (called: ${called}, caller: ${caller}) ***`);
  return interacting(called, caller, { type: "launch" });
};

interaction = async (called, caller, query = "", digit = null) => {
  console.log(`Function executed: interaction`);

  let action = null;

  if (digit) {
    query = `Digit Pressed: ${digit}`; //this change has not being commited.
    action = { type: "text", payload: query };
    logTranscript(`Digit Pressed: ${digit}`);
  } else {
    // twilio always ends everythings with a period, we remove it
    query = query.slice(0, -1);
    query = `(${caller}) ${query}`; //This line was modified so it looks like "(+14077779910) Hi, my name is Xavier"
    action = query.trim() ? { type: "text", payload: query } : null;
    logTranscript(query);
  }
  //I Should include a console.log within the logtranscript function.
  return interacting(called, caller, action);
};

async function saveTranscript(username) {
  if (globals.VOICEFLOW_PROJECT_ID) {
    if (!username || username == "" || username == undefined) {
      username = "Anonymous";
    }

    const now = new Date();
    const timestamp = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;

    axios({
      method: "put",
      url: "https://api.voiceflow.com/v2/transcripts",
      data: {
        sessionID: globals.VOICEFLOW_SESSION,
        versionID: globals.VOICEFLOW_VERSION_ID,
        projectID: globals.VOICEFLOW_PROJECT_ID,
        device: "Phone",
        os: "Twilio",
        browser: "Twilio",
        user: {
          name: `${username} (${timestamp})`,
          image:
            "https://s3.amazonaws.com/com.voiceflow.studio/share/twilio-logo-png-transparent/twilio-logo-png-transparent.png",
        },
      },
      headers: {
        Authorization: globals.VOICEFLOW_API_KEY,
      },
    })
      .then(function(response) {
        console.log("<<< Transcription saved, check Voiceflow's Transcript section! >>>");
        globals.VOICEFLOW_SESSION = `${globals.VOICEFLOW_VERSION_ID}.${createSession()}`;
      })
      .catch((err) => console.log(`------- ERROR: ${err}`));
  }
}


const app = express();

app.use(logger("dev"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.get("/", async (req, res) => {
  res.send(
    `<center><br><br><br>Voiceflow Twilio Integration version 1.0 <b>(Remastered by Xavier Villarroel)</b> is up and running<br><br><br><img src="https://i.imgur.com/m0hXMEW.png"></center>`,
  );
});
const router = express.Router();

router.use("/ivr", twilio.webhook({ validate: false }));

router.post("/ivr/launch", async (req, res) => {  //<------------------- THIS IS WHERE EVERYTHING BEGINS --------------------|

  // console.log(`----- Calling /ivr/launch -----`);
  const { Called, Caller } = req.body;

  console.log(` ********************************************************
                *********************** NEW CALL ***********************
                ********************************************************`);

  logTranscript(`Event: ${JSON.stringify(req.body)}`);
  logTranscript(`First time: Called is ${Called} and Caller is ${Caller}`);

  /*- I could add here (and modify) the globals variables depending on the called party -*/

  res.send(await launch(Called, Caller));
});

router.post("/ivr/interaction", async (req, res) => {
  console.log(`----- Calling /ivr/interaction -----`);
  const { Called, Caller, SpeechResult, Digits } = req.body;
  res.send(await interaction(Called, Caller, SpeechResult, Digits));
});

app.use(router);

app.use(function(req, res, next) {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render("error", {
    message: err.message,
    error: app.get("env") === "development" ? err : {},
  });
});

// const PORT = process.env.PORT || 3000;
const server = app.listen(3000, function() { console.log(" ---------- STARTING SERVER V1.0 ----------"); }); //This is what happens first
module.exports = server;