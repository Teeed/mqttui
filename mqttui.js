// MQTTUI
// jquery Mobile <-> MQTT connector
//
// Copyright (C) 2017 Tadeusz Magura-Witkowski
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.


function MQTTManager() {
	this.ui = [];
	this.radios = {};
};

MQTTManager.prototype.connect = function(host, port, username, password, prefix) {
	this.host = host;
	this.port = port;
	this.username = username;
	this.password = password;
	this.prefix = prefix;

	this.reConnect();
};

MQTTManager.prototype.reConnect = function() {	
	this.mqtt = new Paho.MQTT.Client(
						this.host,
						this.port,
						"web_" + Math.random());
	var options = {
		timeout: 3,
		useSSL: false,
		cleanSession: true,
		onSuccess: (function(){
			this.onConnected();
		}).bind(this),
		onFailure: (function () {
			this.onConnectionLost({errorCode: 1, errorMessage: 'Could not establish'});
		}).bind(this),
		userName: this.username,
		password: this.password,
	};

	this.mqtt.onConnectionLost = this.onConnectionLost.bind(this);
	this.mqtt.onMessageArrived = this.onMessageArrived.bind(this);

	this.mqtt.connect(options);
};

MQTTManager.prototype.onConnectionLost = function(responseObject) {
	if (responseObject.errorCode !== 0) {
		console.log("onConnectionLost: "+responseObject.errorMessage);

		this.disconnected();

		setTimeout(function() {
			this.reConnect();
		}.bind(this), 3000);
	}
}

MQTTManager.prototype.onMessageArrived = function(message) {
	var topic = message.destinationName;
	var payload = message.payloadString;

	console.log('r: ' + topic + ' = ' + payload);

	this.mqttReceive(topic, payload);
};

MQTTManager.prototype.onConnected = function() {
	console.log('Connected');

	for (var i = this.ui.length - 1; i >= 0; i--) {
		this.ui[i].connected(this);
	}

	this._mqttInit();
};

MQTTManager.prototype._mqttInit = function() {
	this.mqttSubscribe('mixer/_sys/reload_request');
	this.subscribed = [];
};

MQTTManager.prototype._received_reloadRequest = function() {
	window.location = window.location;
};

MQTTManager.prototype.mqttSubscribe = function(topic) {
	console.log('Sub: ' + topic);

	this.mqtt.subscribe(topic, {qos: 0});
};

MQTTManager.prototype.mqttMessage = function(topic, payload) {
	console.log('s: ' + topic + ' = ' + payload);

	var msg = new Paho.MQTT.Message(payload)
	msg.destinationName = topic;
	this.mqtt.send(msg);
};

MQTTManager.prototype.mqttReceive = function(topic, payload) { 
	if(topic == this.prefix + '_sys/reload_request') {
		this._received_reloadRequest();

		return;
	}

	for (var i = this.ui.length - 1; i >= 0; i--) {
		this.ui[i].receive(topic, payload);
	}
}

MQTTManager.prototype._addControl = function(room) {
	this.ui.push(room)
};

MQTTManager.prototype.disconnected = function() {
	for (var i = this.ui.length - 1; i >= 0; i--) {
		this.ui[i].initialState();
	}
};

MQTTUI = new MQTTManager();

function MQTTControl(manager, elem, isFirst) {
	this.manager = manager;
	this.elem = elem;
	this.isFirst = isFirst;
};

MQTTControl.prototype.enabled = function(is_enabled) {
	console.log('enabled undefined!');
};

MQTTControl.prototype.initialState = function() {
	this.enabled(false);
};

MQTTControl.prototype.init = function() {
	this.mqtt_topic = $(this.elem).data('mqtt');

	this.bind();
};

MQTTControl.prototype.uiSet = function(data) {
	console.log('uiSet undefined!')
};

MQTTControl.prototype.bind = function(first_argument) {
	this.elem.on('change', function(){
		this.onUiChangeValue(this.elem.val());
	}.bind(this));
};
MQTTControl.prototype.unbind = function(first_argument) {
	this.elem.off('change');
};

MQTTControl.prototype.onMqttSet = function(val) {
	this.unbind();
	this.uiSet(val);
	this.bind();
	this.enabled(true);
};

MQTTControl.prototype.onUiChangeValue = function(value) {
	this.manager.mqttMessage(this.mqtt_topic, value);
};

MQTTControl.prototype.receive = function(topic, data) {
	if((this.mqtt_topic == topic || this.mqtt_topic + '/response' == topic) && data != '?') {
		this.onMqttSet(data);
	}
};

MQTTControl.prototype.connected = function() {
	this.initialState();
	if(this.isFirst) {
		this.manager.mqttSubscribe(this.mqtt_topic);
		this.manager.mqttSubscribe(this.mqtt_topic + '/response');
		this.manager.mqttMessage(this.mqtt_topic, '?');
	}
};

function MQTTControlSlider(manager, elem, isFirst) {
	this.manager = manager;
	this.elem = elem;
	this.isFirst = isFirst;
};
MQTTControlSlider.prototype = new MQTTControl();
MQTTControlSlider.prototype.uiSet = function(val) {
	this.elem.val(val);
	this.elem.slider('refresh');
};
MQTTControlSlider.prototype.enabled = function(is_enabled) {
	this.elem.slider(is_enabled ? 'enable' : 'disable')
};

MQTTControlSlider.prototype.onUiChangeValue = function(value) {
	if(this.sendTimeout) {
		clearTimeout(this.sendTimeout);
	}

	this.sendTimeout = setTimeout(function(){
		this.manager.mqttMessage(this.mqtt_topic, value);
	}.bind(this), 250);
};

function MQTTControlCheckbox(manager, elem, isFirst) {
	this.manager = manager;
	this.elem = elem;
	this.isFirst = isFirst;
};
MQTTControlCheckbox.prototype = new MQTTControl();
MQTTControlCheckbox.prototype.bind = function() {
	this.elem.on('change', function(){
		this.onUiChangeValue(this.elem.prop('checked') ? '1' : '0');
	}.bind(this));
}
MQTTControlCheckbox.prototype.uiSet = function(val) {
	this.elem.prop('checked', val == '1');
	this.elem.flipswitch('refresh');
};
MQTTControlCheckbox.prototype.enabled = function(is_enabled) {
	this.elem.flipswitch(is_enabled ? 'enable' : 'disable')
};


function MQTTControlRadio(manager, elem, isFirst) {
	this.manager = manager;
	this.elem = elem;
	this.isFirst = isFirst;
};
MQTTControlRadio.prototype = new MQTTControl();

MQTTControlRadio.prototype.uiSet = function(val) {
	var name = $(this.elem).attr('name');
	var group = $('input[name=' + name + ']'); // this is bad, I will die in hell 

	group.prop('checked', false);
	group.filter('[value=' + val + ']').prop('checked', true);
	group.checkboxradio('refresh');
};

MQTTControlRadio.prototype.enabled = function(is_enabled) {
	this.elem.checkboxradio(is_enabled ? 'enable' : 'disable')
};

MQTTManager.prototype.addControl = function(item) {
	this._addControl(item);
};


jQuery.fn.mqttUI = function(room_id) {
	var o = $(this) // It's your element

	$(o).each(function(k, v) {
		var v = $(v);
		var type = v.data('type');

		if(type == undefined) {
			type = v.attr('type');
		}

		var TYPES = {
			'range': MQTTControlSlider,
			'checkbox': MQTTControlCheckbox,
			'radio': MQTTControlRadio,
		}

		var objType = TYPES[type];
		var isFirst = true;
		if(type == 'radio') {
			var name = v.attr('name');

			var arr = MQTTUI.radios[name];
			if(arr == undefined) {
				arr = MQTTUI.radios[name] = [];
			} else {
				isFirst = false;
			}

			arr.push(v);
		}

		var obj = new objType(MQTTUI, v, isFirst);
		obj.init();

		MQTTUI.addControl(obj);

	});

	return this;
};