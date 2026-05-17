const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

app.get('/phone', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/phone/index.html'));
});

app.get('/controller', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/controller/index.html'));
});

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('command', (data) => {
        console.log('Command received:', data);
        socket.broadcast.emit('command', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
