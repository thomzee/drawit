var socket;
var colorPicker;
var cv;
var inputSize;
var defaultSize = 4;
var defaultColor = '#ed225d';
var inputColorLabel;
var inputSizeLabel;

function setup() {
	noStroke();
	cv = createCanvas(800, 600);
	cv.position(500, 10);
	background(51);

	inputColorLabel = createElement('p', 'Brush Color');
	inputColorLabel.position(10, 10);
	colorPicker = createColorPicker(defaultColor);
  	colorPicker.position(10, 50);

	inputSizeLabel = createElement('p', 'Brush Size');
	inputSizeLabel.position(10, 100);
  	inputSize = createInput(defaultSize, 'number');
  	inputSize.position(10, 150);

	socket = io.connect('http://localhost:3000');
	socket.on('mouse', newDrawing);
}

function newDrawing(data) {
	strokeWeight(data.size);
	stroke(data.color.levels);
	line(data.x, data.y, data.pX, data.pY);
}

function mouseDragged() {
	strokeWeight(inputSize.value());
	stroke(colorPicker.color());
	line(mouseX, mouseY, pmouseX, pmouseY);

	var data  = {
		x: mouseX,
		y: mouseY,
		pX: pmouseX,
		pY: pmouseY,
		color: colorPicker.color(),
		size: inputSize.value()
	}

	socket.emit('mouse', data);
}

function draw() {
	
}