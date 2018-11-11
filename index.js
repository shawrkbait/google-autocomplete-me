var app = require('koa')(),
	cookie = require('cookie'),
	serve = require('koa-static'),
        async = require('async');
    var request = require('request');
var querystring = require('querystring');
var Sentencer = require('sentencer');

const PORT = process.env.OPENSHIFT_NODEJS_PORT || 8080;
const IP = process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0';

app.use(serve('./public'));

var server = require('http').Server(app.callback()),
	io = require('socket.io')(server);

var answerTimeout = 15;

// Store array of user data
var users = [];
var user_answers = [];
var user_final_answers = [];
var real_answers = [];

var curQuestion = "";
var gameRunning = false;
var createAnswerTmout;
var submitAnswerTmout;

// TODO: allow max of 9 players

io.on('connection', function(socket) {
  var addedUser = false;

  socket.on('master', () => {
    console.log("Emitting update state");
    socket.emit('update state', {
      users: users
    });
  });

  socket.on('add user', (username) => {
    if (addedUser) return;

    socket.username = username;
    console.log(socket.username + " joined");
    users.push({ 
      username: username,
      score: 0 
    });
    addedUser = true;

    // send to all
    console.log("Emitting update state");
    io.emit('update state', {
      users: users
    });
  });

  socket.on('start game', () => {
    if(gameRunning) return;
    console.log("Game started by " + socket.username);
    gameRunning = true;

    doGameTest();
  });

  //Process someone's answer
  socket.on('create_answer', (answer) => {
    console.log(socket.username + " answered \"" + answer + "\"");
    user_answers.push({
      username: socket.username,
      answer: answer
    });

    console.log(user_answers.length + " of " + users.length);
    if (users.length == user_answers.length) {
      onCreateAnswer();
    }
  })

  socket.on('submit_answer', (answer) => {
    console.log(socket.username + " submitted \"" + answer + "\"");
    user_final_answers.push({
      username: socket.username,
      answer: answer
    });

    console.log(user_final_answers.length + " of " + users.length);
    if (users.length == user_final_answers.length) {
      onSubmitAnswer();
    }
  })

  socket.on('disconnect', () => {
    if (addedUser) {
      // TODO: remove user
      // TODO: remove user answer + answer2
    }
  });

});

function onCreateAnswerTmout() {
  console.log("Step 1 Timed out");
  onCreateAnswer();
}

function onCreateAnswer() {
  // Send subset of user answers + real answers
  var answers = generateAnswers(user_answers);
  console.log("Emitting select_answer");
  io.emit("select_answer", {
    question: curQuestion,
    answers: answers
  });
  clearTimeout(createAnswerTmout);
  submitAnswerTmout = setTimeout(onSubmitAnswerTmout, answerTimeout * 1000);
} 

function onSubmitAnswerTmout() {
  console.log("Step 2 Timed out");
  onSubmitAnswer();
}

function onSubmitAnswer() {
  updateScores(users,user_final_answers);
  console.log("Emitting update state");
  io.emit('update state', {
    users: users
  });
  user_answers = [];
  user_final_answers = [];
  gameRunning = false;
  clearTimeout(submitAnswerTmout);
} 

function generateAnswers(user_answers) { 
  var shuffled_ar = real_answers.slice(0,10-user_answers.length);

  for(var i=user_answers.length -1; i>=0; i--) {
    shuffled_ar.push(user_answers[i].answer);
  }
  // TODO: randomize order
  return shuffle(shuffled_ar);
}

function updateScores(users, user_final_answers) {
  
}

function shuffle(array) {
    let counter = array.length;

    // While there are elements in the array
    while (counter > 0) {
        // Pick a random index
        let index = Math.floor(Math.random() * counter);

        // Decrease counter by 1
        counter--;

        // And swap the last element with it
        let temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }

    return array;
}

function doGame() {
      var question = "";
    var answers = [];

    // Regenerate until we have a valid question
    async.whilst(function () {
      return answers.length == 0;
    },
    function (next) {
      var encoded = querystring.escape(randomQuestion());
      request('http://suggestqueries.google.com/complete/search?client=firefox&q=' + encoded, { json: true }, (err, res, body) => { 
        if (!err && res.statusCode == 200) {
          question = body[0];
          console.log("Question = " + question);
          answers = body[1];
          console.log("Orig Answers = " + body);
            // strip out all that don't actually start with question
            for(var i=answers.length -1; i>=0; i--) {
              if(!answers[i].startsWith(question) || answers[i] == question) {
                //console.log("removing \"" + answers[i] + "\" from answers");
                answers.splice(i,1);
              }
              else {
                answers[i] = answers[i].substring(question.length, answers[i].length);
              }
            }
        }
        console.log("# Answers = " +answers.length)
        next();
      });
    },
    function (err) {
      console.log("Real Answers = " + JSON.stringify(answers));
      real_answers = answers;
      // TODO: store point values
      curQuestion = question;
      console.log("Emitting question");
      io.emit("question", {
        question: curQuestion
      });


      // wait for answer creation
      createAnswerTmout = setTimeout(onCreateAnswerTmout, answerTimeout * 1000);
    });
}

function randomQuestion() {
  return Sentencer.make("why does {{ name }}");
}
  

function doGameTest() {
    var question = "why does harold";
    var answers = [" finch limp"," hate it when lena cries"," like going to funerals"," kill kyle"];

    console.log("Real Answers = " + JSON.stringify(answers));
    real_answers = answers;
    // TODO: store point values
    curQuestion = question;
      console.log("Emitting question");
    io.emit("question", {
      question: curQuestion
    });


    // wait for answer creation
    createAnswerTmout = setTimeout(onCreateAnswerTmout, answerTimeout * 1000);
}

server.listen(PORT, IP);
