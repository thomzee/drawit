var express = require('express');
require('dotenv').config();
var app = express();
var server = app.listen(process.env.APP_PORT);
app.use(express.static(__dirname + '/public'));
const cors = require('cors');
app.use(cors());

const port = process.env.APP_PORT;
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