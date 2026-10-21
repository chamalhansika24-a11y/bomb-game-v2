const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const correctAnswers = {
    bomb1: ["10", "15", "20"],
    bomb2: ["5", "10", "15"],
    bomb3: ["1", "2", "3"],
    bomb4: ["7", "8", "9"]
};

const bombLimits = {
    bomb1: 180,  // 3 mins
    bomb2: 420,  // 7 mins
    bomb3: 780,  // 13 mins
    bomb4: 1200  // 20 mins
};

const teamList = [
    "Kubi.exe", "StackOverflow", "Everywhere 2.0", "BYTE KNIGHTS",
    "Pentabyte", "NoZero", "Invariants", "CacheMe", "Nexus", "FrostByte"
];

let teams = {};
let gameState = 'waiting';
let elapsedTime = 0;
let timerInterval = null;

function initTeams() {
    teams = {};
    teamList.forEach(teamName => {
        teams[teamName] = {
            online: false,
            score: 0,
            bomb1: { status: 'active', attempts: 0 },
            bomb2: { status: 'active', attempts: 0 },
            bomb3: { status: 'active', attempts: 0 },
            bomb4: { status: 'active', attempts: 0 }
        };
    });
}
initTeams();

io.on('connection', (socket) => {
    socket.emit('updateState', teams);
    socket.emit('gameState', { state: gameState, time: elapsedTime });

    // Login Restriction Logic
    socket.on('registerTeam', (teamName) => {
        if(teams[teamName]) {
            if (teams[teamName].online && socket.teamName !== teamName) {
                // දැනටමත් වෙන කෙනෙක් Online නම් Reject කරනවා
                socket.emit('loginRejected', 'මෙම කණ්ඩායමට දැනටමත් වෙනත් දුරකථනයකින් සම්බන්ධ වී ඇත!');
            } else {
                // කවුරුත් නැත්නම් Login එක Accept කරනවා
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
                
                let needsUpdate = false;
                for(let teamName in teams) {
                    ['bomb1', 'bomb2', 'bomb3', 'bomb4'].forEach(b => {
                        if(teams[teamName][b].status === 'active' && elapsedTime >= bombLimits[b]) {
                            teams[teamName][b].status = 'exploded';
                            needsUpdate = true;
                        }
                    });
                }
                
                if (needsUpdate) io.emit('updateState', teams);

                if (elapsedTime >= 1200) {
                    clearInterval(timerInterval);
                    gameState = 'finished';
                    io.emit('gameState', { state: gameState, time: elapsedTime });
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
        for(let i=0; i<3; i++) {
            if(codeArray[i] === actualAnswers[i]) correctCount++;
        }

        if(correctCount === 3) {
            currentBomb.status = 'defused';
            let timeBonus = bombLimits[bomb] - elapsedTime;
            teams[team].score += (100 + timeBonus);
        } else {
            currentBomb.attempts += 1;
            if(currentBomb.attempts >= 2) {
                currentBomb.status = 'exploded';
                if(correctCount === 1) teams[team].score += 20;
                if(correctCount === 2) teams[team].score += 50;
            }
        }
        io.emit('updateState', teams);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));