# GooglyGook

## Objective:
Acquire points over 10 rounds by guessing the top auto-complete recommendations as defined by Google.  

## Setup:
* Start the server (npm start)
* Visit http://servername:8080
* Enter a username
* When all players are ready, any player may click “start game”

## Play:
1. Players will be shown the beginning of a google search term.    
1. Players have 60 seconds to complete the search term, attempting to guess the most popular Google search beginning with the original word/phrase.
   * If a user cannot come up with a good search term, she may pass by clicking submit without modifying the original term.
1. Once all players have entered what they think the most popular search term is, the top answer as well as player-created answers will be shown.
   * With less than 4 players, other real search terms will also be shown.  
   * With more than 4 players, player answers are chosen at random so there are never more than 5 answers to select from. If a player’s answer is shown on a given round, it will be less likely for his answer to be shown on the next round.
   * If your answer isn’t shown, you can still get points by selecting the correct search term.  
1. Players will have 60 seconds to select from a list what they think is the top Google search.
1. Points are granted to users based on whether they selected the top search term and also for each time his/her player-created search term is selected.
   * 10 points for selecting the top search term
   * 5 points for each time a player’s answer was selected
1. Bonus points may also be granted for answers that duplicate top search terms
   * 9 points for selecting the second top search term
   * 8 points for selecting the third top search term
   * 7 points for selecting the fourth top search term
   * etc.
1. The TV dashboard will show the LeaderBoard as well as the latest round’s search terms
1. The player with the most points after 10 rounds is declared the winner.

## Example:
1. Players are shown “food is”.
   * The most popular search at the time of writing  would be “food is medicine”.  
   * Note that the most popular search could have very well been something without a space such as “food issues”.  
1. Player creates “food is love” and also selects it from the list.
1. Player selects own answer and 1 other player also selects this answer
   * 5 points for each user who selected the answer. (5x2) = 10 points
   * It happens that “food is love" is also the seventh top search term.
      * 4 points for duplicating the seventh top google search
1. Player would receive (4 + 5 * 2) = 14 points this round.
