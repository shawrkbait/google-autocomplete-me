require('./public/const.js')
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
var user_answers = [];
var user_answers2 = [];

var curquestion = "rachel";

io.on('connection', function(socket) {
  var addedUser = false;

  socket.on('add user', (username) => {
    if (addedUser) return;

    socket.username = username;
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

  socket.on('start game', () => {
    curQuestion = getQuestion();
    io.emit("question", {
      question: curQuestion
    });
  });

  //Process someone's answer
  socket.on('create_answer', (answer) => {
    console.log(socket.username + " answered " + answer);
    user_answers.push({
      username: socket.username,
      answer: answer
    });

    // TODO: Timeout
    // All answers are in
    if (users.length == user_answers.length) {
      // Send subset of user answers + real answers
      var answers = generateAnswers(user_answers);
      io.emit("question_answers", {
        question: curQuestion,
        answers: answers
      });
    }
  })

  socket.on('submit_answer', (answer) => {
    user_answers2.push({
      username: socket.username,
      answer: answer
    });

    // TODO: Timeout
    // All answers are in
    if (users.length == user_answers2.length) {
      updateScores(users,user_answers2);
      io.emit('update state', {
        users: users
      });
      user_answers = [];
      user_answers2 = [];
    }
  })

  socket.on('disconnect', () => {
    if (addedUser) {
      // TODO: remove user
      // TODO: remove user answer + answer2
    }
  });

});

// TODO: Generate text from dictionary, etc.?
const getQuestion = () => {
  return "rachel";
}

// TODO: Generate from users + real
const generateAnswers = (user_ans) => {
  return [
    { id: 1, answer: "a"},
    { id: 2, answer: "b"},
    { id: 3, answer: "c"},
    { id: 4, answer: "d"}
  ];
}

server.listen(PORT, IP);
