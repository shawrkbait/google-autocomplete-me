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
    var sorted_users = data.users.sort(function(a,b) {return b[1] - a[1]});
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
        row.append($("<td/>").text(sorted_users[rowIndex][0]));
        row.append($("<td/>").text(sorted_users[rowIndex][1]));
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
    $currentInput = $answerInput.focus();
    $('.question.page #answerSelection').html("");
    $(".page:not(.question)").hide();
    $questionPage.show();

    var readOnlyLength = data.question.length;
    qlen = readOnlyLength;
    $answerInput.prop('readonly', false);
    $answerInput.val(data.question);

    $answerInput.on('keypress, keydown', function(event) {
      var $field = $(this);
      if ((event.which != 37 && (event.which != 39))
        && ((this.selectionStart < readOnlyLength)
        || ((this.selectionStart == readOnlyLength) && (event.which == 8)))) {
        return false;
      }
    });
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
      var row = $("<div/>", {'class': 'row'});
      //var btn = $('<button/>', { 'class': 'btn btn-large btn-secondary',
      var btn = $('<button/>', { 'class': 'btn btn-secondary',
        text: data.question + data.answers[rowIndex],
        name: data.answers[rowIndex],
        type: 'submit',
      });
      btn.on('click', function() {
        selectAnswer($(this).attr("name"));
      });
      row.append(btn);
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
