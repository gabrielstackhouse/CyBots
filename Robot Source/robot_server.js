var io = require('socket.io-client');
var ip = require('ip');

/** Get IP of Robot from OS */
var robotIP = ip.address();
var macAddress;
/** Serialport must be defined. Initialized to "dumb" because I found that bug dumb.
 * @author Nic Losby
 */
var serialPort = "dumb";

/** Get the RPi's mac address and setup the serial port to communicate with the Arduino from the RPi. 
 * @author Nic Losby
 */
require('getmac').getMac(function(err, data){
    if (err){
    	throw err;
    }
    console.log("Got MAC: " + data);
    macAddress = data;

    var SerialPort = require('serialport');

    /** At one point we had two verions of Arduino Uno's so this is legacy code form that. The other Arduino virutally blew up and we replaced it at 3:00am */
	if (macAddress.includes('b8:27:eb:41:0b:d5')){
		serialPort = new SerialPort("/dev/ttyACM0",{
			baudRate: 9600,
			dataBits: 8,
			parity: 'none',
			stopBits: 1,
			flowControl: false
		});
	}
	else {
		serialPort = new SerialPort("/dev/ttyACM0",{
			baudRate: 9600,
			dataBits: 8,
			parity: 'none',
			stopBits: 1,
			flowControl: false
		});
	}

	serialPort.on('open', function(){
		let dir = 'w';
		console.log('Serial Port Opened');
		sleep(1000);
	});
		
});

/**
 * Set up connection with Central Server
 * @author Nic Losby
 * @contructor
 * @param {string} URL - Central Server Hostname
  */
var socket = io.connect('http://proj-309-rb-b-2.cs.iastate.edu:3000', {
	transports: ["websockets", "polling"],
	reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10
});	//Central Server connection

/** Import http server */
var http = require('http');
/** Import Exress, a nice http request handler */
var express = require('express');
/** Start Express */
var app = express();
/** Import sleep for async calls */
var sleep = require('system-sleep');

/** Setup webcam streaming. Get ip address to broadcast with from the OS, setup optimal settings 
 * @author Nic Losby
 */
const LiveCam = require('livecam');
const webcam_server = new LiveCam({
	'ui_addr' : ip.address(),
	'ui_port' : 11000,
	'broadcast_addr' : ip.address(),
	'broadcast_port' : 12000,
	'gst_tcp_addr' : '0.0.0.0',
	'gst_tcp_port' : 10000,
	'start' : function(){
		console.log('WebCam server started!');
	},
	'webcam': {
		'width': 320,
		'height': 240,
		'framerate': 5
	}

});

/** Startup local node server and listen for incomning client connections over socket.io */
var server = app.listen(5210);
var io_RPI = require("socket.io").listen(server); //Operators connect to this
//io_RPI.emit('new robot', 'Robot 1');	//Placeholder robot name

var operator;

/**
 * Connection to Central Server
 * @author Nic Losby
 * @contructor
 * @param {string} MAC Address - MAC Address of the RPi
 * Notify Central Server of Robot connection
 */
socket.on('connect', function(){
	console.log("Connected to Central Server");
	var robotName = "";
	if (macAddress == 'b8:27:eb:83:34:4f')
		robotName = 'Excalibur';
	else if (macAddress == 'b8:27:eb:41:0b:d5')
		robotName = 'Cornelius';
	else if (macAddress == 'b8:27:eb:60:3d:21')
		robotName = 'MrRobot';
	else
		robotName = macAddress;
	
	socket.emit('new robot', robotName, function(){
		console.log("Sent I'm a robot");
	});
});

socket.on('error', function(){
	console.log("Central Server Error");
});

socket.on('disconnect', function(){
	console.log("Disconnected From Central Server");
});

var damage = 0;

/**
 * Connection from User
 * @author Nic Losby
 * @contructor
 * @param {string} Movement Type - The direction the robot or camera should move
 * Notify Central Server of Robot connection
 */
io_RPI.on('connection', function(socket){

	console.log("User connected");

	/** Write to serialport on recieve of data meant for the Arduino */
	socket.on('Serial Movement', function(data){
		serialPort.write(data.dir);

		console.log("Writing: " + data.dir);
	});

	/** Request damage from the Central Server */
	socket.on('request damage', function(damage){
		socket.emit('damage update', damage);
	});

	/** On disconnect form the user, notify the admin */
	socket.on('disconnect', function () {
		console.log('A user disconnected');

	});
	
});

/** Start the webcam server 
 * @author Nic Losby
 */
webcam_server.broadcast();


/** Continuously pull (asyncronisly) from the Arduino to check damage 
 * @author Nic Losby
 */
while(true){
	if (serialPort == "dumb"){
		sleep(0.1);
		continue;
	}
	var readInput = serialPort.read(512);
	if (readInput == null){
		//console.log("Read is null");
		sleep(0.1);
	}
	else {
		readInput = readInput.toString();
		//console.log("Read: " + readInput);
		damage = readInput.substring(readInput.indexOf(":"));
		console.log("Damage updated to " + damage);
		socket.emit("damage", robotIP + ":" + damage);
	}
}

