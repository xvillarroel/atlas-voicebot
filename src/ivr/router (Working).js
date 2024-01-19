const Router = require('express').Router
const { launch, interaction, dial } = require('./handler')
const axios = require('axios')

const router = new Router()

logTranscript = async (message) => {
  const sheetid = "1XNbbvjnF8GCiDgls0FI0K3GfmoinOcwfcd5nlIRpgD4";
  const lambdaURL = "https://ytzivrzj76ejwc2vdbnzwladdm0nvubi.lambda-url.us-east-1.on.aws/";

  message = (message.indexOf(`<?xml`) > -1)
    ? `(Machine) ${message.substring(message.indexOf('<Say>'), message.lastIndexOf('</Say>')).replace(/<Say>/g, "").replace(/<\/Say>/g, "")}`
    : message;

  axios({
    method: 'post',
    url: lambdaURL,
    data: {
      "sheetid": sheetid,
      "message": message
    }
  })
    .then(function(response) {
      console.log(`Message logged: ${message}`);
      console.log(`Interaction logged in the following sheet: https://docs.google.com/spreadsheets/d/${sheetid}`)
    })
    .catch((err) => console.log(`------- ERROR: ${err}`));

}

router.post('/interaction', async (req, res) => {
  const { Called, Caller, SpeechResult, Digits } = req.body
  res.send(await interaction(Called, Caller, SpeechResult, Digits))
})

router.post('/launch', async (req, res) => {

  console.log(`BODY: ${JSON.stringify(req.body)}`);
  logTranscript(`EVENT: ${JSON.stringify(req.body)}`);

  const { Called, Caller } = req.body
  res.send(await launch(Called, Caller))

})

module.exports = router
