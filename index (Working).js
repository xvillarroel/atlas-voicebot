const PORT = process.env.PORT || 3000;
const express = require('express');
const logger = require('morgan');
const bodyParser = require('body-parser');
const app = express();
const router = require('./src/router'); // Ensure this path is correct

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(router);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: app.get('env') === 'development' ? err : {},
  });
});

// Server Creation and Initialization
const server = app.listen(PORT, function() {
  console.log('Express server listening on port ' + server.address().port);
});

module.exports = server; // Optional, only if you need to export the server