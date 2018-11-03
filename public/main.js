$(function() {
  const CREATE_PAGE = 1;
  const SELECT_PAGE = 2;
  
  var socket = io();

  var $window = $(window);
  var $usernameInput = $('.usernameInput'); // Input for username
  var $loginPage = $('.login.page'); // The login page
  var $scorePage = $('.scoreboard.page'); // The chatroom page
  var $inputMessage = $('.inputMessage'); // Input message input box
  var $scores = $('.scoreboardArea'); // Input message input box
  var $question = $('.questionArea'); // Input message input box
  var $currentInput = $usernameInput.focus();

  var username;

  // Sets the client's username
  const setUsername = () => {
    username = cleanInput($usernameInput.val().trim());

    // If the username is valid
    if (username) {
      $loginPage.fadeOut();
      $scorePage.show();
      $loginPage.off('click');
      $currentInput = $inputMessage.focus();

      // Tell the server your username
      socket.emit('add user', username);
    }
  }
  // Prevents input from having injected markup
  const cleanInput = (input) => {
    return $('<div/>').text(input).html();
  }


  // Keyboard events

  $window.keydown(event => {
    // Auto-focus the current input when a key is typed
    if (!(event.ctrlKey || event.metaKey || event.altKey)) {
      $currentInput.focus();
    }
    // When the client hits ENTER on their keyboard
    if (event.which === 13) {
      if (username) {
      } else {
        setUsername();
      }
    }
  });

  const updateScores = (users, options) => {
    var table = $("<table/>");
    var thead = $("<thead/>");
    var tr = $("<tr/>");
    var tbody = $("<tbody/>");
    tr.append($("<th/>").text("User"));
    tr.append($("<th/>").text("Score"));
    thead.append(tr);
    table.append(thead);
    $.each(users,function(rowIndex, r) {
        var row = $("<tr/>");
        row.append($("<td/>").text(users[rowIndex].username));
        row.append($("<td/>").text(users[rowIndex].score));
        tbody.append(row);
    });
    table.append(tbody);
    $scores.html(table);
    console.log(table);
  }


  socket.on('login', (data) => {
    console.log("Welcome!");
  });
  
  socket.on('update state', (data) => {
    updateScores(data.users);

    // Temporary
    socket.emit('start game', 'test');
  });

  socket.on('question', (data) => {
    console.log(data);

    // Temporary user-generated answer
    socket.emit('create_answer', "maddow");
  });

  socket.on('question_answers', (data) => {
    console.log(data);
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
