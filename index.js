console.log(`************************************************************************************************************************`);

function createSession() {
  let randomNo = Math.floor(Math.random() * 1000 + 1);
  let timestamp = Date.now();
  let date = new Date();
  let weekday = new Array(7);
  weekday[0] = "Sunday";
  weekday[1] = "Monday";
  weekday[2] = "Tuesday";
  weekday[3] = "Wednesday";
  weekday[4] = "Thursday";
  weekday[5] = "Friday";
  weekday[6] = "Saturday";
  let day = weekday[date.getDay()];
  // Join random number+day+timestamp
  let session_id = randomNo + day + timestamp;
  return session_id;
}

let globals = {
  TWILIO_ACCOUNT_SID: "AC762c0c7bcd2d90fc35f4917c6445e397",
  TWILIO_AUTH_TOKEN: "cdf6a57fb5919b9e805f14b27e7aab72",
  TWILIO_PHONE_NUMBER: "+18556998467",

  VOICEFLOW_API_URL: "https://general-runtime.voiceflow.com",
  VOICEFLOW_API_KEY: "VF.DM.659f3367213c970007153034.04p2pQumxTYhGAux",
  VOICEFLOW_VERSION_ID: "659f28896e8269a135ddc3cf",
  VOICEFLOW_PROJECT_ID: "659f28896e8269a135ddc3ce",
  VOICEFLOW_SESSION: `659f28896e8269a135ddc3cf.${createSession()}`,

  DYNAMO_TABLE: "voiceflow-twilio-ivr-logs",

  ZDAUTH: "Basic eGF2aWVyLnZpbGxhcnJvZWxAdHJpbG9neS5jb20vdG9rZW46M2dWWWc2MVF2MDM3S2lyNXNFVGZtNllOY3BVRFFGZXVIbDVDdHlsMw==",
  ZDCREATEENDPOINT: "https://central-supportdesk.zendesk.com/api/v2/tickets.json",
  TRANSFER_NUMBER: "+11234567890", //+18284079349 (Benjis)
  CALL_TRIGGER: "TRANSFERCALLTOAGENT",
  END_PHONE: "+12345678901", //Xavi's phone
  TABLE_NAME: "voiceflow-twilio-ivr-logs",
};

//Dependencies

require("dotenv").config();
const express = require("express");
const logger = require("morgan");
const bodyParser = require("body-parser");
const twilio = require("twilio");
const axios = require("axios");
const VoiceResponse = require("twilio").twiml.VoiceResponse;

// Functions

const callZendesk = async (url, payload, method) => {
  try {
    const response = await axios({
      url: url,
      method: method,
      headers: {
        Authorization: globals.ZDAUTH,
        'Content-Type': 'application/json',
      },
      data: payload,
    });
    return response.data;
  } catch (err) {
    console.error(err);
    return null;
  }
};

function delay(seconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

const updateTicket = async (userTicket, sessionID) => {

  let payload = {
    ticket_id: userTicket,
    session_id: sessionID,
    public: false,
    table_name: globals.TABLE_NAME
  };

  console.log(`UPDATE INFORMATION = ${JSON.stringify(payload)}`);


  let url = 'https://clvwkpf2pxh5avmhovccsrle2q0ecpfl.lambda-url.us-east-1.on.aws';

  try {
    const response = await axios.post(url, payload,);
    console.log(`Dynamo Zendesk Writter Success: ${JSON.stringify(response.data)}`);
  } catch (err) {
    console.error("Dynamo Zendesk Writter Error:", err.message || err);
  }
};

const createTickets = async (userPhone, machinePhone, callReceived, sessionID,) => {
  let preffix = callReceived
    ? `Call Received from ${userPhone} to ${machinePhone} `
    : `Call Made from ${machinePhone} to ${userPhone}`;

  let titleString = `[ FULL CONVERSATION RECORDED ] ${preffix}`;

  let fullBody = `<h1>Full conversation with customer ${userPhone}<h1><p>The complete conversation with this customer will be uploaded to this ticket shortly.</p>`;

  let payload = {
    ticket: {
      brand_id: 360000073433,
      group_id: 360001805099,
      ticket_form_id: 360000007214,
      organization_id: 360101627714,
      assignee_id: 361984297214,
      status: "solved",
      priority: "low",
      type: "task",
      custom_fields: [
        {
          "id": "360001160034",
          "value": "remotecamp"
        }
      ],
      comment: {
        html_body: fullBody,
        public: false,
      },
      subject: titleString,
      requester: {
        email: "atlas@trilogy.com"
      },
      tags: [
        "cs-ai-voicebot-prod",
        "atlas-ticket-custom-closure",
        "ai-customclosure"
      ]
    },
  };

  //I deleted this field: custom_fields: [{ id: 360001160034, value: "cs_central_finance" }],

  let id = 0;
  console.log(`NEW TICKET INFORMATION = ${JSON.stringify(payload)}`);
  let txNumber = await callZendesk(globals.ZDCREATEENDPOINT, payload, "POST");
  consoleLog(`New ticket: ${txNumber.ticket.id} `, sessionID);
  id = txNumber.ticket.id;
  await updateTicket(id, sessionID);

  return id;
};

consoleLog = async (message, callSID, activePhone = null) => {
  const lambdaURL =
    "https://qigzuvctd5pfb4gcqugtjnbsc40odvoa.lambda-url.us-east-1.on.aws/";

  if (activePhone) {
    message =
      message.indexOf(`<?xml`) > -1
        ? `(Machine to ${activePhone}) ${message
          .substring(message.indexOf("<Say>"), message.lastIndexOf("</Say>"))
          .replace(/<Say>/g, "")
          .replace(/<Say\/>/g, "")
          .replace(/<\/Say>/g, "")}`
        : message;
  } else {
    message =
      message.indexOf(`<?xml`) > -1
        ? `(Machine) ${message
          .substring(message.indexOf("<Say>"), message.lastIndexOf("</Say>"))
          .replace(/<Say>/g, "")
          .replace(/<Say\/>/g, "")
          .replace(/<\/Say>/g, "")}`
        : message;
  }

  axios({
    method: "post",
    url: lambdaURL,
    data: {
      message: message,
      session: callSID,
      dynamo_table_name: globals.DYNAMO_TABLE,
    },
  })
    .then(function(response) {
      console.log(`Message logged: ${message}`);
    })
    .catch((err) =>
      console.log(`------- ERROR (96): ${err}, Message: ${message}`),
    );
};

getCircularReplacer = () => {
  const seen = new WeakSet();
  return (key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
};

const findPublicPhone = async (number) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/1dOXxA2MLQlnoDAHink1DEaKrUIbNFArrnZD3l6TX18E/values/RAW!A1:F?key=AIzaSyCO8yb8FFHwAbaJR6YmfQXKgZxkGEQjk5A`;

  let publicNumber = -1;
  let array;
  let response;

  try {
    response = await axios.get(url);
    array = response.data.values;
    for (let i = 0; i < array.length; i++) {
      if (array[i].includes(number.toString())) {
        publicNumber = i;
      }
    }
    console.log(`Last Index where the number was found: ${publicNumber}`);
  } catch (err) {
    console.error("Fetching from Sheets Error:", err);
  }

  console.log(`Product public phone number is ${array[publicNumber][3]}`)

  return array[publicNumber][3];
};

const getPhone = (phone) => {

  const array = ["+12393824074", "+12393824088", "+13138870765", "+13462503426", "+13854442583", "+14016003224", "+14452134175", "+14692491096", "+14694096146", "+14696088741", "+14697083972", "+14809776713", "+15122290128", "+15122290130", "+15124363932", "+15128611974", "+15129570625", "+15129570662", "+15129570666", "+15129570667", "+15129571640", "+15129572316", "+15156664627", "+15189927431", "+16028132300", "+16198542647", "+16198804909", "+16198805032", "+16467765965", "+16513771334", "+16785130004", "+17137662531", "+17162613446", "+17206533370", "+18009416119", "+18018779543", "+18323038096", "+18323063016", "+18328274194", "+18328480055", "+18333060496", "+18333792578", "+18335651916", "+18335732197", "+18335732216", "+18335732289", "+18335732303", "+18335782009", "+18554768573", "+18588683106", "+18662036710", "+18663750770", "+18663799390", "+18664389508", "+18774774899", "+18774779672", "+18882339144", "+18882569055", "+18882907424", "+18882971250", "+18883182047", "+18883390639", "+18883539417", "+18885065217", "+18885769392", "+18885863257", "+18886581866", "+19294364660", "+19723647231", "+19725280049", "+19725289061", "+19725565067", "+19725590154", "+19725590241", "+19725877314", "+19725877493", "+19725877883", "+19725877907", "+19725877931", "+19725877939", "+19725877979", "+19725884036", "+19725884111", "+19725884124", "+19725884130", "+19725884148", "+19725884200", "+19725884221", "+19726667008", "+19726667165", "+19726667287", "+19726667395", "+19726667448", "+19726667573", "+19726667644", "+19728464959", "+19728952008", "+19728952189", "+31858881472", "+33801840980", "+33805080916", "+33805118331", "+48422036370", "+441143920333", "+441143920513", "+441143921305", "+442039667599", "+442039668458", "+443308081671", "+443308083873", "+448000608520", "+448081890922", "+420228883068", "+498000010129", "+498000010146", "+498000010168", "+498000010169", "+498000010170", "+498000010481", "+498000010482", "+498000010514", "+498005893918"];

  // XAVIER ACCOUNT NUMBERS:

  array.push("+12675507722");  //My Twilio number

  array.push("+14405863257");  //My Twilio number NEWNET (TrilogyMain Account)
  array.push("+18556998467");  //My Twilio number JIGSAW (Xavier Account))
  array.push("+16508177577");  //My Twilio number MOBILOGY (Xavier Account)
  array.push("+18782167333");  //My Twilio number

  // TRILOGY ACCOUNT NUMBERS:

  array.push("+441852370111"); //My Twilio number CITYNUMBERS (Trilogy Account)
  array.push("+441483930111"); //My Twilio number CALLSTREAM (Trilogy Account)
  array.push("+13349863257");  //My Twilio number NEWNET (Trilogy Account)
  array.push("+14177390111");  //My Twilio number JIGSAW (Trilogy Account) 
  array.push("+19137330111");  //My Twilio number MOBILOGY (Trilogy Account)

  array.push("+16623996999");  //SUPER NUMBER IN TWILIO (Trilogy Account) 

  if (phone.indexOf('+') === -1) {
    phone = '+' + phone;
  }

  return array.findIndex(row => row === phone);
}

const interact = async (userPhone, machinePhone, action, callReceived, callSID,) => {

  console.log(`Check this statistic: UserPhone = ${userPhone} and MachinePhone = ${machinePhone}`);

  //ACTION: { type: "text", payload: query }

  const twiml = new VoiceResponse();
  let voiceflowUser = machinePhone;

  const request = {
    method: "POST",
    url: `https://general-runtime.voiceflow.com/state/user/${encodeURI(
      voiceflowUser,
    )}/interact`,
    headers: {
      Authorization: globals.VOICEFLOW_API_KEY,
      sessionid: globals.VOICEFLOW_SESSION,
    },
    data: {
      action,
      config: { stopTypes: ["DTMF"] },
      state: {
        variables: {
          calledParty: machinePhone,
          callingParty: userPhone,
          callSID: callSID
        },
      },
    },
  };

  const response = await axios(request);
  let takingOnlyDTMFs = false;

  let transferNewNumber = globals.TRANSFER_NUMBER;
  response.data.forEach((trace) => {
    if (trace.payload && trace.payload.message) {
      if (trace.payload.message.includes(globals.CALL_TRIGGER)) {
        transferNewNumber = trace.payload.message.split('=')[1];
        trace.type = "CALL";
        console.log(`After change to CALL = ${JSON.stringify(trace)}`);
      }
      if (trace.payload.message.includes("use your phone's keypad to enter the 7-digit ticket number")) {
        takingOnlyDTMFs = true;
        console.log(`DTMF-only mode ENABLED.`);
      }
      if (trace.payload.message.includes("You have dialed") && trace.payload.message.includes("correct")) {
        takingOnlyDTMFs = false;
        console.log(`DTMF-only mode DISABLED.`);
      }
    }
  });

  const endTurn = response.data.some((trace) =>
    ["CALL", "end"].includes(trace.type),
  );

  if (endTurn) {
    agent = twiml;
  } else {
    if (takingOnlyDTMFs) {
      agent = twiml.gather({
        input: "dtmf",
        numDigits: 7,
        speechTimeout: "auto", //This number is good for crawling but fur humans, it should be in AUTO
        action: "/ivr/interaction",
        profanityFilter: false,
        actionOnEmptyResult: true,
        method: "POST",
        speechModel: 'experimental_utterances',
        timeout: 20
      });
    } else {
      agent = twiml.gather({
        input: "speech dtmf",
        numDigits: 1,
        speechTimeout: "auto", //This number is good for crawling but fur humans, it should be in AUTO
        action: "/ivr/interaction",
        profanityFilter: false,
        actionOnEmptyResult: true,
        method: "POST",
        speechModel: 'experimental_utterances',
        language: 'en-US',
        hints:
          "press 1, press 2, press 3, press 4, press 5, press 6, press 7, press 8, press 9, press 0",
      });
    }
  }

  // loop through the response
  for (const trace of response.data) {
    switch (trace.type) {
      case "text":
      case "speak": {
        agent.say(trace.payload.message);
        break;
      }
      case "CALL": {
        const number = transferNewNumber;
        console.log("Calling ", number);
        twiml.dial(number);
        break;
      }
      case "end": {
        console.log(`Entering case END.`);
        consoleLog(`twiml.toString() = ${twiml.toString()}`, callSID, userPhone);
        saveTranscript(userPhone, machinePhone, callReceived, callSID);
        twiml.hangup();
        break;
      }
      default: {
      }
    }
  }

  consoleLog(twiml.toString(), callSID, userPhone); //Deleted by accident.
  return twiml.toString();
};

launch = async (Caller, Called, callReceived, callSID) => {
  return interact(Caller, Called, { type: "launch" }, callReceived, callSID);
};

interaction = async (userPhone, machinePhone, callReceived, query = "", digit = null, callSID,) => {
  let action = {};
  console.log(`Interacting...`);

  const twiml = new twilio.twiml.VoiceResponse();

  if (query === '[CUSTOMER HUNG UP THE CALL]') {
    console.log(`Customer hung up the call`);
    saveTranscript(userPhone, machinePhone, callReceived, callSID);
    twiml.hangup();
    consoleLog(twiml.toString(), callSID, userPhone);
    return twiml.toString();
  }

  if (digit) {
    query = `(${userPhone}) Digit Pressed: ${digit}`;
    action = { type: "text", payload: query };
  } else {
    query = `(${userPhone}) ${query}`;
    action = query.trim() ? { type: "text", payload: query } : null;
  }
  consoleLog(query, callSID);

  return interact(userPhone, machinePhone, action, callReceived, callSID);
};

async function saveTranscript(userPhone, machinePhone, callReceived, callSID) {
  let conversationTitle;
  await createTickets(userPhone, machinePhone, callReceived, callSID);

  if (globals.VOICEFLOW_PROJECT_ID) {
    if (callReceived) {
      conversationTitle = `Call Received from ${userPhone}`;
    } else {
      conversationTitle = `Call Made to ${userPhone}`;
    }

    const now = new Date();
    const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")} ${now
        .getHours()
        .toString()
        .padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now
          .getSeconds()
          .toString()
          .padStart(2, "0")}`;

    try {
      const response = await axios({
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
            name: `${conversationTitle} (${timestamp})`,
            image:
              "https://s3.amazonaws.com/com.voiceflow.studio/share/twilio-logo-png-transparent/twilio-logo-png-transparent.png",
          },
        },
        headers: {
          Authorization: globals.VOICEFLOW_API_KEY,
        },
      });

      console.log(
        "<<< Transcription saved, check Voiceflow's Transcript section! >>>",
      );

      globals.VOICEFLOW_SESSION = `${globals.VOICEFLOW_VERSION_ID
        }.${createSession()}`;
      return response;
    } catch (err) {
      console.log(`------- ERROR (461): ${err}`);
      return err;
    }
  } else {
    return null;
  }
}

/*------------------------------------------------------------------------------*/
/*------------------------------------------------------------------------------*/
/*------------------------------------------------------------------------------*/

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

router.post("/ivr/interaction", async (req, res) => {
  console.log(JSON.stringify(req, getCircularReplacer()));
  const { Called, Caller, CallSid, CallStatus, Digits } = req.body;
  let SpeechResult = req.body.SpeechResult;
  let callSID = CallSid;
  console.log(`CallStaus = ${CallStatus}`);

  if (CallStatus && CallStatus === 'completed') {
    SpeechResult = '[CUSTOMER HUNG UP THE CALL]';
  }

  let callReceived = (getPhone(Called) > -1);
  let machinePhone = callReceived ? Called : Caller;
  let userPhone = callReceived ? Caller : Called;

  //This code must be commented once the port is done.
  machinePhone = await findPublicPhone(userPhone)
  if (machinePhone === -1) {
    machinePhone = await findPublicPhone(userPhone)
  }

  ////////////////////////////////////////////////////

  console.log(`[router.post("/ivr/interaction")]: machinePhone = ${machinePhone}, userPhone = ${userPhone}`, callSID,);

  res.send(
    await interaction(userPhone, machinePhone, callReceived, SpeechResult, Digits, callSID,),
  );
});

router.post("/ivr/launch", async (req, res) => {
  let { Called, Caller, CallSid, SpeechResult } = req.body;

  if (SpeechResult && SpeechResult.trim() !== "") {
    console.log("/ivr/launch has been called erroneously. Waiting for next interaction.");
    const twiml = new VoiceResponse();
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  let callSID = CallSid;
  let callReceived = (getPhone(Called) > -1);
  let machinePhone = callReceived ? Called : Caller;
  let userPhone = callReceived ? Caller : Called;

  //This code must be commented once the port is done.
  machinePhone = await findPublicPhone(userPhone)
  if (machinePhone === -1) {
    machinePhone = await findPublicPhone(userPhone)
  }
  ////////////////////////////////////////////////////

  if (callReceived) {
    consoleLog(` <<<<<<<<<<<< NEW CALL RECEIVED: From (${userPhone}) to (${machinePhone}) <<<<<<<<<<<<`, callSID,);
  } else {
    consoleLog(` >>>>>>>>>>>> NEW CALL MADE: to (${userPhone}) from (${machinePhone}) >>>>>>>>>>>>`, callSID,);
  }

  consoleLog(`Event: ${JSON.stringify(req.body)}`, callSID);
  res.send(await launch(userPhone, machinePhone, callReceived, callSID));
});

app.use(router);

app.use(function(req, res, next) {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.json({
    message: err.message,
    error: app.get("env") === "development" ? err : {},
  });
});

// const PORT = process.env.PORT || 3000;
const server = app.listen(3000, function() {
  console.log(" ---------- STARTING SERVER V1.0 ----------");
}); //This is what happens first
module.exports = server;
