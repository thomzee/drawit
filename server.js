var express = require('express');
require('dotenv').config();
var app = express();
var server = app.listen(process.env.PORT || process.env.APP_PORT || 3000);
app.use(express.static(__dirname + '/public'));
const cors = require('cors');
app.use(cors());

const port = process.env.PORT || process.env.APP_PORT || 3000;
console.log(`Server is running at ${port}...`);

var socket = require('socket.io');
var io = socket(server);

// In-memory shared state so late joiners see the existing artwork.
var MAX_HISTORY = 9000;
var history = [];
var users = {};

io.on('connection', function (socket) {
	users[socket.id] = true;
	var count = Object.keys(users).length;

	// Replay the current canvas to the newcomer, then update everyone's count.
	socket.emit('init', { history: history, count: count });
	io.emit('presence', count);

	socket.on('draw', function (seg) {
		history.push(seg);
		if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
		socket.broadcast.emit('draw', seg);
	});

	socket.on('clear', function () {
		history = [];
		io.emit('clear');
	});

	socket.on('cursor', function (c) {
		socket.broadcast.emit('cursor', {
			id: socket.id,
			x: c.x,
			y: c.y,
			color: c.color,
			brush: c.brush
		});
	});

	socket.on('disconnect', function () {
		delete users[socket.id];
		socket.broadcast.emit('leave', socket.id);
		io.emit('presence', Object.keys(users).length);
	});
});
