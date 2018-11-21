var app = require('koa')(),
	serve = require('koa-static'),
        session = require('koa-session'),
        cookie = require('cookie'),
        async = require('async');
    var request = require('request');
var querystring = require('querystring');
var Sentencer = require('sentencer');
var Hashmap = require('hashmap');
var randy = require('randy');

const PORT = process.env.OPENSHIFT_NODEJS_PORT || 8080;
const IP = process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0';
const FAKE_ANSWER_POINTS = 5;
const NUM_SELECTABLE_ANSWERS = 5; // max = 10
const ANSWER_TIMEOUT = 60;

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
var valid_answer_count = 0;
// TODO: allow max of 9 players

var _names = require('./words/names.js');
var _obj_beg = require('./words/object_beginnings.js');
var _past = require('./words/past_verbs.js');
var _present = require('./words/present_verbs.js');
var _propernouns = require('./words/proper_nouns.js');
var _questions = require('./words/questions.js');
Sentencer.configure({

  actions: {
    name: function(){
      return randy.choice(_names);
    },
    object_beginning: function(){
      return randy.choice(_obj_beg);
    },
    past_verb: function(){
      return randy.choice(_past);
    },
    present_verb: function(){
      return randy.choice(_present);
    },
    proper_noun: function(){
      return randy.choice(_propernouns);
    },
    question: function(){
      return randy.choice(_questions);
    }
  }
});
Sentencer._nouns = Sentencer._nouns.concat(require('./words/nouns.js'));

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

/*
 * real_answers: real_answers = ["a","b"]
 * user_answers: user_answers.entries() = [["username", "answer"],]
 * final_answers: user_final_answers.entries() = [["username", "answer"],]
 */

  // A dashboard for the current game state
  socket.on('dashboard', (username) => {
    socket.emit("update_state", {
      state: curState,
      question: curQuestion,
      real_answers: real_answers.slice(0,NUM_SELECTABLE_ANSWERS-valid_answer_count),
      user_state: getUserState()
    });
  });

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
        state: curState,
        question: curQuestion,
        user_state: getUserState()
      });
    }
    else if(curState == "select_answer") {
      io.emit("update_state", {
        state: curState,
        question: curQuestion,
        answers: selectable_answers
      });
    }
    else {
      socket.emit("update_state", {
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
    valid_answer_count = 0;
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
    state: curState,
    question: curQuestion,
    answers: selectable_answers
  });

  clearTimeout(createAnswerTmout);
  submitAnswerTmout = setTimeout(onSubmitAnswerTmout, ANSWER_TIMEOUT * 1000);
} 

function onSubmitAnswerTmout() {
  console.log("Step 2 Timed out");
  onSubmitAnswer();
}

function onSubmitAnswer() {
  updateScores(users,user_final_answers);
  curState = "between_games";
  console.log("Emitting update state (" + curState + ") " + users.entries());

  io.emit("update_state", {
    state: curState,
    question: curQuestion,
    real_answers: real_answers.slice(0,NUM_SELECTABLE_ANSWERS-valid_answer_count),
    user_state: getUserState()
  });
  clearTimeout(submitAnswerTmout);
} 

function generateAnswers(user_answers) { 
  var answer_set = user_answers.values();
  // Don't publish invalid (empty) user answers
  for(var i=0; i<answer_set.length; i++) {
    if(answer_set[i] == '') {
      answer_set.splice(i,1);
    }
    else {
      valid_answer_count++;
    }
  }
  var shuffled_ar = real_answers.slice(0,NUM_SELECTABLE_ANSWERS-valid_answer_count);

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
      createAnswerTmout = setTimeout(onCreateAnswerTmout, ANSWER_TIMEOUT * 1000);
    });
}

function getUserState() {
  var us = users.entries();
  var objs = [];
  for(var i=0; i<us.length; i++) {
    var obj = {
      username: us[i][0],
      this_score: 0,
      total_score: us[i][1],
      answer: user_answers.get(us[i][0])
    }
    objs.push(obj);
  }
  return objs;
}

function randomQuestion() {
  return Sentencer.make("{{ question }}",2);
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
    createAnswerTmout = setTimeout(onCreateAnswerTmout, ANSWER_TIMEOUT * 1000);
}

server.listen(PORT, IP);
