const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const correctAnswers = {
    bomb1: ["1", "2", "3"], 
    bomb2: ["1", "2", "3", "4", "5"],
    bomb3: ["1", "2", "3", "4", "5", "6", "7"]
};

const teamList = [
    "Kubi.exe", "StackOverflow", "Everywhere 2.0", "BYTE KNIGHTS",
    "Pentabyte", "NoZero", "Invariants", "CacheMe", "Nexus", "FrostByte"
];

let teams = {};
let gameState = 'waiting';
let elapsedTime = 0;
let timerInterval = null;

function formatTime(seconds) {
    let m = Math.floor(seconds / 60);
    let s = seconds % 60;
    return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
}

function initTeams() {
    teams = {};
    teamList.forEach(teamName => {
        teams[teamName] = {
            online: false,
            score: 0,
            bomb1: { status: 'active', attempts: 0, timeTaken: '', correct: 0, base: 0, bonus: 0, total: 0 },
            bomb2: { status: 'active', attempts: 0, timeTaken: '', correct: 0, base: 0, bonus: 0, total: 0 },
            bomb3: { status: 'active', attempts: 0, timeTaken: '', correct: 0, base: 0, bonus: 0, total: 0 }
        };
    });
}
initTeams();

io.on('connection', (socket) => {
    socket.emit('updateState', teams);
    socket.emit('gameState', { state: gameState, time: elapsedTime });

    socket.on('registerTeam', (teamName) => {
        if(teams[teamName]) {
            if (teams[teamName].online && socket.teamName !== teamName) {
                socket.emit('loginRejected', 'මෙම කණ්ඩායමට දැනටමත් වෙනත් දුරකථනයකින් සම්බන්ධ වී ඇත!');
            } else {
                socket.teamName = teamName;
                teams[teamName].online = true;
                socket.emit('loginSuccess');
                io.emit('updateState', teams);
            }
        }
    });

    socket.on('disconnect', () => {
        if (socket.teamName && teams[socket.teamName]) {
            teams[socket.teamName].online = false;
            io.emit('updateState', teams);
        }
    });

    socket.on('startGame', () => {
        if (gameState === 'waiting') {
            gameState = 'playing';
            elapsedTime = 0;
            io.emit('gameState', { state: gameState, time: elapsedTime });
            
            timerInterval = setInterval(() => {
                elapsedTime++;
                io.emit('timerUpdate', elapsedTime);

                if (elapsedTime >= 1200) {
                    clearInterval(timerInterval);
                    gameState = 'finished';
                    for(let teamName in teams) {
                        ['bomb1', 'bomb2', 'bomb3'].forEach(b => {
                            if(teams[teamName][b].status === 'active') {
                                teams[teamName][b].status = 'exploded';
                                teams[teamName][b].timeTaken = '20:00';
                            }
                        });
                    }
                    io.emit('gameState', { state: gameState, time: elapsedTime });
                    io.emit('updateState', teams);
                }
            }, 1000); 
        }
    });

    socket.on('resetGame', () => {
        clearInterval(timerInterval);
        gameState = 'waiting';
        elapsedTime = 0;
        initTeams();
        io.emit('gameState', { state: gameState, time: elapsedTime });
        io.emit('updateState', teams);
    });

    socket.on('submitCode', (data) => {
        if (gameState !== 'playing') return;

        const { team, bomb, codeArray } = data;
        let currentBomb = teams[team]?.[bomb];

        if(!currentBomb || currentBomb.status !== 'active') return;

        let correctCount = 0;
        let actualAnswers = correctAnswers[bomb];
        let totalNeeded = actualAnswers.length;

        for(let i=0; i<totalNeeded; i++) {
            if(codeArray[i] === actualAnswers[i]) correctCount++;
        }

        let baseScore = correctCount * 100;
        let timeLeft = Math.max(1200 - elapsedTime, 0);
        let timeBonus = Math.floor(timeLeft / 10) * correctCount;
        
        let attemptResult = '';

        if(correctCount === totalNeeded) {
            currentBomb.status = 'defused';
            currentBomb.timeTaken = formatTime(elapsedTime);
            currentBomb.correct = correctCount;
            currentBomb.base = baseScore;
            currentBomb.bonus = timeBonus;
            currentBomb.total = baseScore + timeBonus;
            teams[team].score += currentBomb.total;
            
            attemptResult = 'defused';
        } else {
            currentBomb.attempts += 1;
            if(currentBomb.attempts >= 2) {
                currentBomb.status = 'exploded';
                currentBomb.timeTaken = formatTime(elapsedTime);
                currentBomb.correct = correctCount;
                currentBomb.base = baseScore;
                currentBomb.bonus = timeBonus;
                currentBomb.total = baseScore + timeBonus;
                teams[team].score += currentBomb.total;
                
                attemptResult = 'exploded';
            } else {
                attemptResult = 'wrong';
            }
        }
        
        // ළමයින්ගේ ෆෝන් එකට ප්‍රතිඵලය යැවීම
        io.emit('attemptFeedback', {
            team: team,
            status: attemptResult,
            correctCount: correctCount,
            totalNeeded: totalNeeded,
            attemptsLeft: 2 - currentBomb.attempts
        });

        io.emit('updateState', teams);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));