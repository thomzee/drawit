var express = require('express');
require('dotenv').config();
var app = express();
const port = process.env.PORT || process.env.APP_PORT || 3000;
var server = app.listen(port);
app.use(express.static(__dirname + '/public'));
const cors = require('cors');
app.use(cors());

console.log(`Server is running at ${port}...`);

var socket = require('socket.io');

var io = socket(server);

io.sockets.on('connection', newConnection);

function newConnection(socket) {
        //console.log('new connection ' + socket.id);
        socket.on('mouse', mouseMsg);
        function mouseMsg(data) {
                socket.broadcast.emit('mouse', data);
        }
}