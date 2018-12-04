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
var weightedRandom = require('weighted-random');


const PORT = process.env.OPENSHIFT_NODEJS_PORT || 8080;
const IP = process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0';
const NUM_SELECTABLE_ANSWERS = 5; // max = 10
const FAKE_ANSWER_POINTS = 5;
const ANSWER_MS_TIMEOUT = 60000; // 60 seconds
const MIN_REAL_ANSWERS = 5;

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
var user_state = new Hashmap();
var answer_state = new Hashmap();
var user_final_answers = new Hashmap();
var user_answers = new Hashmap();
var real_answers = [];
var selectable_answers = []

var session_users = new Hashmap();
var curQuestion = "";
var createAnswerTmout;
var submitAnswerTmout;
var curState = "between_games";
var waiting_for_answers = 0;


var _names = require('./words/names.js');
var _obj_beg = require('./words/object_beginnings.js');
var _past = require('./words/past_verbs.js');
var _present = require('./words/present_verbs.js');
var _propernouns = require('./words/proper_nouns.js');
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
    }
  }
});
Sentencer._nouns = Sentencer._nouns.concat(require('./words/nouns.js'));

var _questions = [
  { weight: Sentencer._nouns.length,		question: "do {{ nouns }} "},
  { weight: _past.length * _obj_beg.length, 	question: "i {{ past_verb }} {{ object_beginning }} "},
  { weight: Sentencer._nouns.length, 		question: "how does {{ a_noun }} "},
  { weight: Sentencer._nouns.length, 		question: "how to watch {{ a_noun }} "},
  { weight: _present.length, 			question: "what happens if you {{ present_verb }} "},
  { weight: Sentencer._nouns.length, 		question: "why does {{ a_noun }} "},
  { weight: _propernouns.length, 		question: "why does {{ proper_noun }} "},
  { weight: _names.length, 			question: "{{ name }} "},
  { weight: Sentencer._nouns.length, 		question: "{{ noun }}"}
]

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

  // A dashboard for the current game state
  socket.on('dashboard', (username) => {
    socket.is_dashboard = 1;
    socket.emit("update_state", {
      state: curState,
      question: curQuestion,
      user_state: user_state.values(),
      answer_state: answer_state.entries()
    });
  });

  socket.on('add user', (username) => {
    console.log('add user');
    var uname = session_users.get(socket.request.name);
    // user is checking for session
    if(uname) {
      socket.username = uname;
      console.log("Emitting set_username: " + uname);
      socket.emit("set_username", {
        username: uname
      });
    }
    else if(typeof username === 'undefined' || ! /^[a-zA-Z0-9]+$/.test(username)) {
      console.log("Emitting login_required " + username);
      socket.emit("update_state", {state: "login_required"});
      return;
    }
    else if(socket.username == username) {
      // Already logged in
    }
    else if(user_state.get(username)) {
      // Username already exists
      console.log("Emitting login_required to " + username);
      socket.emit("update_state", {state: "login_required", error: "username is taken"});
      return;
    }
    else {
      // map session id to a username
      session_users.set(socket.request.name, username);
      socket.username = username;
      console.log(socket.username + " joined");
      user_state.set(username, {username: username, total_score: 0, answer: ""});
      socket.user_selected = 0;
      socket.user_weight = 1;
    }
    console.log("Emitting update state (" + curState + ") ");

    if(curState == "between_games") {
      // send to all
      io.emit("update_state", {
        state: curState,
        question: curQuestion,
        user_state: user_state.values(),
        answer_state: answer_state.entries()
      });
    }
    else if(curState == "select_answer") {
      socket.emit("update_state", {
        state: curState,
        question: curQuestion,
        answers: selectable_answers
      });
    }
    else {
      socket.emit("update_state", { 
        state: "waiting",
        question: curQuestion
      });
    }
  });

  socket.on('start game', () => {
    if(curState != "between_games") return;
    user_answers = new Hashmap();
    selectable_answers = [];
    user_final_answers = new Hashmap();
    user_state.forEach(function(value, key) {
      var obj = user_state.get(key);
      user_state.set(key, obj);
    });
    answer_state = new Hashmap();
    io.of('/').adapter.clients((err, clients) => {
      for(var i=0; i< clients.length; i++) {
        io.sockets.connected[clients[i]].user_selected = 0;
      }
    });
    waiting_for_answers = 0;
    console.log("Game started by " + socket.username);

    doGame();
  });

  //Process someone's answer
  socket.on('create_answer', (answer) => {
    if(socket.user_selected != 1 || socket.is_dashboard == 1)
      return;

    console.log(socket.username + " answered \"" + answer + "\"");

    /* Make all answers look googly
     *  convert to lowercase and remove punctuation
     */
    var mangledA = answer.toLowerCase();
    mangledA = mangledA.replace(/[\?\.\!]$/gi,"");
    user_answers.set(socket.username, mangledA);

    console.log(user_answers.size + " of " + waiting_for_answers);
    if (waiting_for_answers == user_answers.size) {
      onCreateAnswer();
    }
  })

  socket.on('submit_answer', (answer) => {
    console.log(socket.username + " submitted \"" + answer + "\"");
    user_final_answers.set(socket.username, answer);

    console.log(user_final_answers.size + " of " + user_state.size);
    if (user_state.size == user_final_answers.size) {
      onSubmitAnswer();
    }
  })

  socket.on('disconnect', () => {
    console.log(socket.username + " disconnected");
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
  submitAnswerTmout = setTimeout(onSubmitAnswerTmout, ANSWER_MS_TIMEOUT);
} 

function onSubmitAnswerTmout() {
  console.log("Step 2 Timed out");
  onSubmitAnswer();
}

function onSubmitAnswer() {
  updateScores(user_state,user_final_answers);
  curState = "between_games";
  console.log("Emitting update state (" + curState + ") " + user_state.entries());

  io.emit("update_state", {
    state: curState,
    question: curQuestion,
    user_state: user_state.values(),
    answer_state: answer_state.entries()
  });
  clearTimeout(submitAnswerTmout);
} 

function generateAnswers(user_answers) { 
  var answer_set = user_answers.entries();
  var unique_answer_count = 1;
  
  // Add top real answer
  answer_state.set(real_answers[0], {
    created_by: ["- Real #1 -"],
    selected_by: [],
    created_by_points: 0,
    selected_by_points: 10
  });

  for(var i=0; i<answer_set.length; i++) {
    // Don't publish invalid (empty) user answers
    if(answer_set[i][1] == '') {
      answer_set.splice(i,1);
    }
    else {
      var cur = answer_state.get(answer_set[i][1]);
      if(cur) {
        cur.created_by.push(answer_set[i][0]);
        cur.created_by_points = FAKE_ANSWER_POINTS;
      }
      else {
        unique_answer_count++;
        cur = {
          created_by: [answer_set[i][0]],
          selected_by: [],
          created_by_points: FAKE_ANSWER_POINTS,
          selected_by_points: 0
        };
      }
      answer_state.set(answer_set[i][1], cur);
    }
  }

  // Supplement with other real answers
  for(var i=1; i<real_answers.length; i++) {
    var cur = answer_state.get(real_answers[i]);
    // user answer is same as real answer
    if(cur) {
      cur.created_by.push("- Real #" + (i+1) + " -");
      cur.selected_by_points = 10 - i;
      //TODO: more points for creating a real answer, but nobody selected?
    }
    else if(unique_answer_count >= NUM_SELECTABLE_ANSWERS) {
      continue;
    }
    else {
      cur = {
        created_by: ["- Real #" + (i+1) + " -"],
        selected_by: [],
        created_by_points: 0,
        selected_by_points: 10 - i
      };
      unique_answer_count++;
    }
    answer_state.set(real_answers[i], cur);
  }

  return shuffle(answer_state.keys());
}

function updateScores(user_state, user_final_answers) {
  var u = user_state.keys();
  for(var i=0; i<u.length; i++) {
    var final_ans = user_final_answers.get(u[i]);
    var score = answer_state.get(final_ans).selected_by_points;

    var obj = user_state.get(u[i]);

    var astate = answer_state.get(final_ans);
    astate.selected_by.push(u[i]);
    answer_state.set(final_ans, astate);

    if(final_ans && score != 0) {
      obj.total_score += score;
    }
    user_state.set(u[i], obj);

    var user_answer_entries = user_answers.entries();
    for(var j=0; j<user_answer_entries.length; j++) {
      var created_answer = user_answer_entries[j][1];
      var created_by = user_answer_entries[j][0];
      var ustate = user_state.get(created_by);

      if(final_ans == created_answer) {
        ustate.total_score += FAKE_ANSWER_POINTS;
        user_state.set(created_by, ustate);
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
      return answers.length < MIN_REAL_ANSWERS;
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

      curState = "question";
      io.of('/').adapter.clients((err, clients) => {

        var internal_clients =  clients.slice();
        for(var i=0; i<NUM_SELECTABLE_ANSWERS-1; i++) {
          var weights = [];
          for(var j=0; j<internal_clients.length; j++) {
            var s = io.sockets.connected[internal_clients[j]];
            // !s.user_weight is waiting for login?
            if(s.is_dashboard || !s.user_weight) weights.push(0);
            else weights.push(s.user_weight);
          }
          // Select a random player to get real question
          var selection = weightedRandom(weights);
          if(selection == -1) {
            break;
          }
          var sock = io.sockets.connected[internal_clients[selection]];
          internal_clients.splice(selection, 1);
          console.log("Emitting question to " + sock.username + " weight=" + sock.user_weight);
          sock.user_selected = 1;
          sock.user_weight/=2;
          waiting_for_answers++;

          sock.emit("update_state", {
            state: curState,
            question: curQuestion
          });
        }

        console.log("Remaining clients = " + internal_clients.length);
        // Remaining clients can vote, but not create answers
        for(var i=0; i<internal_clients.length; i++) {
          var sock = io.sockets.connected[internal_clients[i]];
          if(sock.username) {
            console.log("Emitting wait to " + sock.username);
            sock.emit("update_state", {
              state: "waiting",
              question: curQuestion
            });
          }
          else {
            console.log("Updating dashboard");
            sock.emit("update_state", {
              state: curState,
              question: curQuestion
            });
          }
        }
      });

      // wait for answer creation
      createAnswerTmout = setTimeout(onCreateAnswerTmout, ANSWER_MS_TIMEOUT);
    });
}

function randomQuestion() {
  var weights = _questions.map(function(q) {
    return q.weight;
  });
  var i = weightedRandom(weights);
  return Sentencer.make(_questions[i].question,2);
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
      state: curState,
      question: curQuestion
    });

    // wait for answer creation
    createAnswerTmout = setTimeout(onCreateAnswerTmout, ANSWER_MS_TIMEOUT);
}

server.listen(PORT, IP);
