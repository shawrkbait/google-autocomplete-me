var app = require('koa')(),
	cookie = require('cookie'),
	serve = require('koa-static');

const PORT = process.env.OPENSHIFT_NODEJS_PORT || 8080;
const IP = process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0';

app.use(serve('./public'));

var server = require('http').Server(app.callback()),
	io = require('socket.io')(server);

// Store array of user data
var users = [];

io.on('connection', function(socket) {
  var addedUser = false;

  // when the client emits 'add user', this listens and executes
  socket.on('add user', (username) => {
    if (addedUser) return;

    users.push({ 
      username: username,
      score: 0 
    });
    addedUser = true;

    // send to all
    io.emit('update state', {
      users: users
    });
  });

  socket.on('disconnect', () => {
    if (addedUser) {
      // TODO: remove user
    }
  });

});

server.listen(PORT, IP);
