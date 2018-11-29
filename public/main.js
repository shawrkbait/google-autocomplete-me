$(function() {
  var socket = io();

  var $window = $(window);
  var $usernameInput = $('.usernameInput'); // Input for username
  var $answerInput = $('.answerInput');
  var $loginPage = $('.login.page'); // The login page
  var $questionPage = $('.question.page');
  var $waitingPage = $('.waiting.page');
  var $scorePage = $('.scoreboard.page'); 
  var $scores = $('.scoreboardArea'); 
  var $currentInput = $usernameInput.focus();

  var username;
  var qlen;

  var curState = "question";

  $answerInput.val("");

  // Check if we already have a session
  socket.emit('add user', );

  // Sets the client's username
  const setUsername = () => {
    username = cleanInput($usernameInput.val().trim());

    // If the username is valid
    if (username) {
      $loginPage.fadeOut();
      $scorePage.show();
      $loginPage.off('click');

      // Tell the server your username
      socket.emit('add user', username);
    }
  }
  // Prevents input from having injected markup
  const cleanInput = (input) => {
    return $('<div/>').text(input).html();
  }

  // Submit events

  $('#form-signin').submit(function(event) {
    event.preventDefault();
    setUsername();
  });
  $('#form-answer').submit(function(event) {
    event.preventDefault();
    createAnswer();
  });
  $('#form-startgame').submit(function(event) {
    event.preventDefault();
    startGame();
  });

  const startGame = () => {
    console.log("Emitting start game");
    socket.emit('start game', 'test');
  }

  const createAnswer = () => {
    var curVal = $answerInput.val();
    curVal = cleanInput(curVal.substring(qlen));
    console.log("Emitting create_answer: " + curVal);
    socket.emit('create_answer', curVal);
    $answerInput.val("");
    $questionPage.hide();
    $waitingPage.show();
    $questionPage.off('click');
  }

  const selectAnswer = (curVal) => {
    console.log("Emitting submit_answer: " + curVal);
    socket.emit('submit_answer', curVal);
    $answerInput.val("");
    $questionPage.hide();
    $waitingPage.show();
    $questionPage.off('click');
  }

  const showScores = (data) => {
    console.log("showScores: " + JSON.stringify(data));
    $(".page:not(.scoreboard)").hide();
    var sorted_users = data.user_state.sort(function(a,b) {return b.total_score - a.total_score});
    var table = $("<table/>");
    var thead = $("<thead/>");
    var tr = $("<tr/>");
    var tbody = $("<tbody/>");
    tr.append($("<th/>").text("User"));
    tr.append($("<th/>").text("Score"));
    thead.append(tr);
    table.append(thead);
    $.each(sorted_users,function(rowIndex, r) {
        var row = $("<tr/>");
        row.append($("<td/>").text(sorted_users[rowIndex].username));
        row.append($("<td/>").text(sorted_users[rowIndex].total_score));
        tbody.append(row);
    });
    table.append(tbody);
    $scores.html(table);
    $scorePage.show();
  }

  const showQuestion = (data) => {
    $('#form-answer').prop("disabled", false);
    $('#form-answer').show();
    console.log("showQuestion: " + JSON.stringify(data));
    $('.question.page #answerSelection').html("");
    $(".page:not(.question)").hide();
    $questionPage.show();

    var readOnlyLength = data.question.length;
    qlen = readOnlyLength;
    $answerInput.prop('readonly', false);
    $answerInput.val(data.question);
    $answerInput.attr({'pattern': '^' + data.question + '.*'});
    $answerInput.attr({'title': data.question});
    $currentInput = $answerInput.focus();
  }

  const showAnswers = (data) => {
    console.log("showAnswers: " + JSON.stringify(data));
    $('#form-answer').prop("disabled", true);
    $('#form-answer').hide();
    var thediv = $('.question.page #answerSelection');
    thediv.html("");

    $waitingPage.fadeOut();
    $questionPage.show();

    $.each(data.answers,function(rowIndex, r) {
      var btn = $('<button/>', { 'class': 'btn btn-secondary form-control form-control-lg',
        text: data.question + data.answers[rowIndex],
        name: data.answers[rowIndex],
        type: 'submit',
      });
      btn.on('click', function() {
        selectAnswer($(this).attr("name"));
      });
      var row = $("<div/>", { "class": "row mb-1 mt-1"});
      var col = $("<div/>", { "class": "col"});
      col.append(btn);
      row.append(col);
      thediv.append(row);
    });
  }

  socket.on('login', (data) => {
    console.log("Welcome!");
  });

  // We may already have a username assigned on the server
  socket.on('set_username', (data) => {
    username = data.username;
  });
 
  socket.on('update_state', (data) => {
    curState = data.state;

    if(data.state == "login_required") {
      $(".page:not(.login)").hide();
      $loginPage.show();
      $currentInput = $usernameInput.focus();
    }
    else if(data.state == "between_games") {
      showScores(data);
    }
    else if(data.state == "question") {
      showQuestion(data);
    }
    else if(data.state == "select_answer") {
      showAnswers(data);
    }
    else if(data.state == "waiting") {
      $(".page:not(.waiting)").hide();
      $waitingPage.show();
    }
  });

  socket.on('disconnect', () => {
    console.log('you have been disconnected');
  });

  socket.on('reconnect', () => {
    console.log('you have been reconnected');
    if (username) {
      socket.emit('add user', username);
    }
  });

  socket.on('reconnect_error', () => {
    console.log('attempt to reconnect has failed');
  });

})
