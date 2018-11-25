$(function() {
  var socket = io();

  var $window = $(window);
  var $answerInput = $('.answerInput');
  var $questionPage = $('.question.page');
  var $scorePage = $('.scoreboard.page'); 
  var $scores = $('.scoreboardArea'); 

  var qlen;

  var curState = "question";

  $answerInput.val("");

  // Check if we already have a session
  socket.emit('dashboard', );

  const showScores = (data) => {
    console.log("showScores: " + JSON.stringify(data));
    $(".page:not(.scoreboard)").hide();
    var sorted_users = data.user_state.sort(function(a,b) {return b[1].total_score - a[1].total_score});
    var table = $("<table/>",{ 'class': 'table'});
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

    table = $("<table/>",{ 'class': 'table'});
    thead = $("<thead/>");
    tr = $("<tr/>");
    tbody = $("<tbody/>");
    tr.append($("<th/>").text("Created by"));
    tr.append($("<th/>").text("Answer"));
    tr.append($("<th/>").text("Selected by"));
    thead.append(tr);
    table.append(thead);

    var sorted_answers = data.answer_state.sort(function(a,b) {return b[1].selected_by_points - a[1].selected_by_points});
    $.each(sorted_answers,function(rowIndex, r) {
        var row = $("<tr/>");
        var td = $("<td/>");
        $.each(sorted_answers[rowIndex][1].created_by, function(i, r) {
          var d = $("<div/>");
          d.text(sorted_answers[rowIndex][1].created_by[i]);
          td.append(d);
        });
        row.append(td);
        row.append($("<td/>").text(data.question + sorted_answers[rowIndex][0]));

        td = $("<td/>");
        $.each(sorted_answers[rowIndex][1].created_by, function(i, r) {
          var d = $("<div/>");
          d.text(sorted_answers[rowIndex][1].selected_by[i]);
          td.append(d);
        });
        row.append(td);
        tbody.append(row);
    });
    table.append(tbody);
    $scores.append(table);
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
  }

  const showAnswers = (data) => {
    console.log("showAnswers: " + JSON.stringify(data));
    $('#form-answer').prop("disabled", true);
    $('#form-answer').hide();
    var thediv = $('.question.page #answerSelection');
    thediv.html("");
    $(".page:not(.question)").hide();

    $questionPage.show();

    $.each(data.answers,function(rowIndex, r) {
      //var btn = $('<button/>', { 'class': 'btn btn-large btn-secondary',
      var btn = $('<button/>', { 'class': 'btn btn-secondary',
        text: data.question + data.answers[rowIndex],
        name: data.answers[rowIndex],
        type: 'submit',
      });
      btn.on('click', function() {
        selectAnswer($(this).attr("name"));
      });
      thediv.append(btn);
    });
  }

  socket.on('login', (data) => {
    console.log("Welcome!");
  });

  socket.on('update_state', (data) => {
    curState = data.state;

    if(data.state == "between_games") {
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
  });

  socket.on('reconnect_error', () => {
    console.log('attempt to reconnect has failed');
  });

})
