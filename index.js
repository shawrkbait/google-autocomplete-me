var app = require('koa')(),
	cookie = require('cookie'),
	serve = require('koa-static'),
        async = require('async');
    var request = require('request');
var querystring = require('querystring');
var Sentencer = require('sentencer');
var Hashmap = require('hashmap');

const PORT = process.env.OPENSHIFT_NODEJS_PORT || 8080;
const IP = process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0';

app.use(serve('./public'));

var server = require('http').Server(app.callback()),
	io = require('socket.io')(server);

var answerTimeout = 15;

// Store array of user data
var users = new Hashmap();
var user_answers = [];
var user_final_answers = new Hashmap();
var real_answers = [];
var score_map = new Hashmap();

var curQuestion = "";
var gameRunning = false;
var createAnswerTmout;
var submitAnswerTmout;

// TODO: allow max of 9 players

io.on('connection', function(socket) {
  var addedUser = false;

  socket.on('master', () => {
    console.log("Emitting update state " + users.entries());
    socket.emit('update state', {
      users: users.entries()
    });
  });

  socket.on('add user', (username) => {
    if (addedUser) return;

    socket.username = username;
    console.log(socket.username + " joined");
    users.set(username, 0);
    addedUser = true;

    // send to all
    console.log("Emitting update state " + users.entries());
    io.emit('update state', {
      users: users.entries()
    });
  });

  socket.on('start game', () => {
    if(gameRunning) return;
    user_answers = [];
    user_final_answers = new Hashmap();
    score_map = new Hashmap();
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

    console.log(user_answers.length + " of " + users.size);
    if (users.size == user_answers.length) {
      onCreateAnswer();
    }
  })

  socket.on('submit_answer', (answer) => {
    console.log(socket.username + " submitted \"" + answer + "\"");
    user_final_answers.set(socket.username, answer);

    console.log(user_final_answers.size + " of " + users.size);
    if (users.size == user_final_answers.size) {
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
    users: users.entries()
  });
  gameRunning = false;
  clearTimeout(submitAnswerTmout);
} 

function generateAnswers(user_answers) { 
  var shuffled_ar = real_answers.slice(0,10-user_answers.length);

  for(var i=0; i<shuffled_ar.length; i++) {
    score_map.set(shuffled_ar[i], 10 - i);
  }
  for(var i=0; i<user_answers.length; i++) {
    shuffled_ar.push(user_answers[i].answer);
  }
  return shuffle(shuffled_ar);
}

function updateScores(users, user_final_answers) {
  var u = users.keys();
  for(var i=0; i<u.length; i++) {
    var ans = user_final_answers.get(u[i]);
    var score = score_map.get(ans);
    console.log("ans = " + ans + ", score = " + score);
    if(ans && score) {
      users.set(u[i], users.get(u[i]) + score);
    }
  }
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
