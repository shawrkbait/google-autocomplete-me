var app = require('koa')(),
	serve = require('koa-static'),
        session = require('koa-session'),
        cookie = require('cookie'),
        async = require('async');
    var request = require('request');
var querystring = require('querystring');
var Sentencer = require('sentencer');
var Hashmap = require('hashmap');

const PORT = process.env.OPENSHIFT_NODEJS_PORT || 8080;
const IP = process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0';
const FAKE_ANSWER_POINTS = 5;

app.keys = ['something secret'];
app.use(session({},app));

app.use(function *(next) {
  if (typeof this.session.name === 'undefined') {
    this.session.name = Math.round(Math.random() * 10000);
  }
  yield next;
});

app.use(serve('./public'));

var server = require('http').Server(app.callback()),
	io = require('socket.io')(server);

var answerTimeout = 60;

// Store array of user data
var users = new Hashmap();
var user_final_answers = new Hashmap();
var user_answers = new Hashmap();
var real_answers = [];
var selectable_answers = []
var score_map = new Hashmap();

var session_users = new Hashmap();
var curQuestion = "";
var createAnswerTmout;
var submitAnswerTmout;
var curState = "between_games";

// TODO: allow max of 9 players

io.set("authorization", function(data, accept) {
  if (data.headers.cookie && data.headers.cookie.indexOf('koa:sess') > -1) {
    data.cookie = cookie.parse(data.headers.cookie)['koa:sess'];
    data.name = JSON.parse(new Buffer(data.cookie, 'base64')).name;

    console.log(data.name);
  } else {
    return accept('No cookie transmitted.', false);
  }
  accept(null, true);
});

io.on('connection', function(socket) {

  socket.on('add user', (username) => {
    var uname = session_users.get(socket.request.name);
    // user is checking for session
    if(uname) {
      socket.username = uname;
      console.log("Emitting set_username: " + uname);
      socket.emit("set_username", {
        username: uname
      });
    }
    else if(typeof username === 'undefined') {
      socket.emit("update_state", {state: "login_required"});
      return;
    }
    else {
      // map session id to a username
      session_users.set(socket.request.name, username);
      socket.username = username;
      console.log(socket.username + " joined");
      users.set(username, 0);
    }
    console.log("Emitting update state (" + curState + ") " + users.entries());
    if(curState == "between_games") {
      // send to all
      io.emit("update_state", {
        users: users.entries(),
        state: curState
      });
    }
    else if(curState == "select_answer") {
      io.emit("update_state", {
        users: users.entries(),
        state: curState,
        question: curQuestion,
        answers: selectable_answers
      });
    }
    else {
      socket.emit("update_state", {
        users: users.entries(),
        state: curState,
        question: curQuestion
      });
    }
  });

  socket.on('start game', () => {
    if(curState != "between_games") return;
    user_answers = new Hashmap();
    selectable_answers = [];
    user_final_answers = new Hashmap();
    score_map = new Hashmap();
    console.log("Game started by " + socket.username);

    doGame();
  });

  //Process someone's answer
  socket.on('create_answer', (answer) => {
    console.log(socket.username + " answered \"" + answer + "\"");

    /* Make all answers look googly
     *  convert to lowercase and remove punctuation
     */
    var mangledA = answer.toLowerCase();
    mangledA = mangledA.replace(/[\?\.\!]$/gi,"");
    user_answers.set(socket.username, mangledA);

    console.log(user_answers.size + " of " + users.size);
    if (users.size == user_answers.size) {
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
      // TODO: remove user
      // TODO: remove user answer + answer2
  });

});

function onCreateAnswerTmout() {
  console.log("Step 1 Timed out");
  onCreateAnswer();
}

function onCreateAnswer() {
  // Send subset of user answers + real answers
  selectable_answers = generateAnswers(user_answers);
  console.log("Emitting select_answer");

  curState = "select_answer";
  io.emit("update_state", {
    users: users.entries(),
    state: curState,
    question: curQuestion,
    answers: selectable_answers
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
  curState = "between_games";
  console.log("Emitting update state (" + curState + ") " + users.entries());

  io.emit('update_state', {
    users: users.entries(),
    state: curState,
    question: curQuestion,
    answers: selectable_answers
  });
  clearTimeout(submitAnswerTmout);
} 

function generateAnswers(user_answers) { 
  var answer_set = user_answers.values();
  var valid_answer_count = 0;
  // Don't publish invalid (empty) user answers
  for(var i=0; i<answer_set.length; i++) {
    if(answer_set[i] == '') {
      answer_set.splice(i,1);
    }
    else {
      valid_answer_count++;
    }
  }
  var shuffled_ar = real_answers.slice(0,10-valid_answer_count);

  for(var i=0; i<shuffled_ar.length; i++) {
    score_map.set(shuffled_ar[i], 10 - i);
  }
  for(var i=0; i<answer_set.length; i++) {
    // Dedup
    if(score_map.get(answer_set[i])) continue;
    shuffled_ar.push(answer_set[i]);
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
    var user_answer_entries = user_answers.entries();
    for(var j=0; j<user_answer_entries.length; j++) {
      var a2 = user_answer_entries[j][1];
      var u2 = user_answer_entries[j][0];
      if(ans == a2) {
        users.set(u2, users.get(u2) + FAKE_ANSWER_POINTS);
      }
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
      curQuestion = question;
      console.log("Emitting question");

      curState = "question";
      io.emit("update_state", {
        users: users.entries(),
        state: curState,
        question: curQuestion
      });

      // wait for answer creation
      createAnswerTmout = setTimeout(onCreateAnswerTmout, answerTimeout * 1000);
    });
}

function randomQuestion() {
  return Sentencer.make("why does {{ a_noun }}",2);
}

function doGameTest() {
    var question = "why does harold";
    var answers = [" finch limp"," hate it when lena cries"," like going to funerals"," kill kyle"];

    console.log("Real Answers = " + JSON.stringify(answers));
    real_answers = answers;
    curQuestion = question;
    console.log("Emitting question");

    curState = "question"
    io.emit("update_state", {
      users: users.entries(),
      state: curState,
      question: curQuestion
    });

    // wait for answer creation
    createAnswerTmout = setTimeout(onCreateAnswerTmout, answerTimeout * 1000);
}

server.listen(PORT, IP);
