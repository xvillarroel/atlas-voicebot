const twilio = require('twilio')
const Router = require('express').Router
const ivrRouter = require('./ivr/router')

const router = new Router()

router.get('/', async (req, res) => {
  res.send('Voiceflow Twilio Integration version 1.0 (Developed by Xavier Villarroel) is up and running')
})

router.use('/ivr', twilio.webhook({ validate: false }), ivrRouter)

module.exports = router