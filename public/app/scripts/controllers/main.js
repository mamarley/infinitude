'use strict';

function wsu(s) {
	var l = window.location;
	return ((l.protocol === 'https:') ? 'wss://' : 'ws://') + l.hostname + (((l.port !== 80) && (l.port !== 443)) ? ':' + l.port : '') + s;
}

var toHex = function (str) {
	var hex = '';
	for(var i=0;i<str.length;i++) {
		hex += ' '+('0' + str.charCodeAt(i).toString(16).toUpperCase()).substr(-2,2);
	}
	return hex;
};

angular.module('infinitude')
	.filter('markDiff', function() {
		return function (str1,str2) {
			if (!str2) { return str1; }
			var indiff = false;
			var out = '';
			for(var i=0;i<str1.length;i++) {
				if (str1.charCodeAt(i) !== str2.charCodeAt(i) && indiff===false) {
					indiff = true;
					out+='<span class="diff">';
				}
				if (str1.charCodeAt(i) === str2.charCodeAt(i) && indiff===true) {
					indiff = false;
					out+='</span>';
				}
				out+=str1.substr(i,1);
			}
			if (indiff) { out+='</span>'; }
			return out;
		};
	})
	.filter('subStr', function() {
		return function (str,start,len) {
			if (!str) { return ''; }
			return str.substr(start,len);
		};
	})
	.filter('strings', function() {
		return function (str, min) {
			min = min || 4;
			var cnt = 0;
			var instring = false;
			var tmp = '';
			var out = '';
			for(var i=0;i<str.length;i++) {
				if (str.charCodeAt(i) === 0 && instring) {
					out+=tmp+'\n';
				}
				if (str.charCodeAt(i) >= 32 && str.charCodeAt(i)<=127) {
					tmp += str.substr(i,1);
					cnt += 1;
					if (cnt>=min) { instring = true; }
				} else {
					cnt = 0;
					instring = false;
					tmp = '';
				}
			}
			return out;
		};
	})
	.filter('toHex', function() {
		return toHex;
	})
	.filter('toList', function() {
		return function(items) {
			var filtered = [];
			angular.forEach(items, function(item) {
				filtered.push(item);
			});
			return filtered;
		};
	})
  .controller('MainCtrl', function ($scope, $http, $interval, $timeout, $location) {
		const GLOBE_COLOR_LOADING='#16F';
		const GLOBE_COLOR_CONNECTED='#44E';
		const GLOBE_COLOR_UNSAVED_CHANGES='#F0F';
		const GLOBE_COLOR_ERROR='#E44';

		$scope.selectedZone = 0;

		$scope.systemsEdit = null;
		// Null indicates the "systems" data has never been copied to "systemsEdit"
		// False means the data has been copied and is currently the same as "systems"
		// True means the data has been copied and the user has edited it
		$scope.systemsEdited = null;

		$scope.mkTime = function(input) {
			if (angular.equals({}, input)) { return '00:00'; }
			return input;
		};

		var store = angular.fromJson(window.localStorage.getItem('infinitude')) || {};

		//charting
		if ($scope.history) {
			var labels = [];
			var lindat = [[],[]];
			angular.forEach($scope.history.coilTemp[0].values, function(v,i) {
				var valen = $scope.history.coilTemp[0].values.length;
				var modul = Math.round(valen/20); //20 data points
				if (i % modul === 0) {
					labels.push(new Date(1000*v[0]).toLocaleString());
					lindat[0].push(v[1]);
					lindat[1].push($scope.history.outsideTemp[0].values[i][1]);
				}
			});
			$scope.oduLabels = labels;
			$scope.oduSeries = ['CoilTemp','OutsideTemp'];
			$scope.oduData = lindat;
		}

		var globeTimer;
		$scope.reloadData = function(userInitiated) {
			if (userInitiated && $scope.systemsEdited) {
				if (confirm('This will erase your unsaved changes')) {
					$scope.systemsEdited = null;
				}
			}
			var keys = ['systems','status','notifications','energy'];
			angular.forEach(keys, function(key) {
				// If "systemsEdit" has been edited, don't switch away from the magenta globe
				if ($scope.systemsEdited !== true) {
					$scope.globeColor = GLOBE_COLOR_LOADING;
				}
				$http.get('/'+key+'.json')
					.then(function(response) {
						var rkey = key;
						if (rkey === 'systems') {
							rkey = 'system';
							// If "systemsEdit" hasn't been populated or hasn't been edited, deep-copy
							// "systems" to it to provide a copy for the user to edit without having
							// the automatic refresh wipe the edits
							if ($scope.systemsEdited === false || $scope.systemsEdited === null) {
								$scope.systemsEdit = angular.copy(response.data[rkey][0]);
							}
						}
						//console.log(key,rkey,response.data);
						$scope[key] = store[key] = response.data[rkey][0];
						// If "systemsEdit" has been edited, don't switch away from the magenta globe
						if ($scope.systemsEdited !== true) {
							$scope.globeColor = GLOBE_COLOR_CONNECTED;
						}
						$timeout.cancel(globeTimer);
						globeTimer = $timeout(function() {
							$scope.globeColor = GLOBE_COLOR_ERROR;
						}, 4*60*1000);
					},
					function() {
						$scope.globeColor = GLOBE_COLOR_ERROR;
						console.log('oh noes!',arguments);
					});
			});
			window.localStorage.setItem('infinitude', angular.toJson(store));
		};

		$scope.$watch('systemsEdit', function() {
			if ($scope.systemsEdit !== null) {
				// If "systemsEdit" was not populated previously or the user undid all changes
				// (making "systemsEdit" equal to "systems" once again), mark the data as not
				// having been edited
				// If "systemsEdit" was already populated, this indicates a user edit
				if ($scope.systemsEdited === null || angular.equals($scope.systems, $scope.systemsEdit)) {
					$scope.systemsEdited = false;
					$scope.globeColor = GLOBE_COLOR_CONNECTED;
				} else if ($scope.systemsEdited === false) {
					$scope.systemsEdited = true;
					$scope.globeColor = GLOBE_COLOR_UNSAVED_CHANGES;
				}
			}
		}, true);

		$scope.reloadData(false);
		$interval($scope.reloadData, 3*60*1000, 0, true, false);

		$scope.isActive = function(route) {
			return route === $location.path();
		};

		$scope.save = function() {
			// Deep-copy "systemsEdit" back to "systems" so that any more
			// changes made before the next reload will appear correctly
			$scope.systems = angular.copy($scope.systemsEdit);
			var systems = { 'system':[$scope.systems] };
			//console.log('saving systems structure', systems);
			$http.post('/systems/infinitude', systems )
				.then(function() {
					setTimeout(function() {
						$scope.reloadData(false);
					}, 10*1000);
					$scope.systemsEdited = false;
					$scope.globeColor = GLOBE_COLOR_CONNECTED;
				},
				function() {
					console.log('oh noes! save fail.');
				});
		};

		$scope.selectZone = function(zone) {
			$scope.selectedZone = zone;
		};

		$scope.equals = function(a, b) {
			return angular.equals(a, b);
		}

		$scope.rawSerial = 'Loading';
		$scope.frames = [];
		$scope.state = angular.fromJson(window.localStorage.getItem('infinitude-serial-state')) || {};
		var serial = new WebSocket(wsu('/serial'));
		serial.onopen = function() { console.log('Socket open'); };
		serial.onclose = function() { console.log('Socket closed'); };
		var transferTimer;
		serial.onmessage = function(m) {
			var frame = angular.fromJson(m.data);
			$scope.transferColor = '#4F4';
			$timeout.cancel(transferTimer);
			$timeout(function() { $scope.transferColor = '#5E5'; }, 2000);

			/* jshint ignore:start */
			var dataView = new jDataView(frame.data);
			$scope.carbus = {};
			$scope.history = angular.fromJson(window.localStorage.getItem('tmpdat')) || {};

			if (frame.Function.match(/write|reply/)) {
				var address = toHex(frame.data.substring(0,3));
				var id = frame.Function + frame.SrcClass + frame.DstClass + address;
				frame.Device = frame.Function === 'reply' ? frame.SrcClass : frame.DstClass;

				var busLog = function(key,value) {
					$scope.history[key] = $scope.history[key] || [{ 'key':key, values:[] }];
					value = $scope.carbus[key];
					$scope.history[key][0].values.push([frame.timestamp,value]);
					if ($scope.history[key][0].values.length>500) {
						$scope.history[key][0].values.shift();
					}
					window.localStorage.setItem('tmpdat',angular.toJson($scope.history));
				};

				// Break this out into config once others publish their registers.
				// Are you reading this? Then you're probably one of those people.
				if (frame.SrcClass.match(/(Furnace|FanCoil)/)) {
					if (address.match(/00 03 06/)) {
						$scope.carbus.blowerRPM = dataView.getInt16(1  +3);
						busLog('blowerRPM');
					}
					if (address.match(/00 03 16/)) {
						$scope.carbus.airflowCFM = dataView.getInt16(4  +3);
						busLog('airflowCFM');
					}
				}
				if (frame.SrcClass.match(/HeatPump/)) {
					if (address.match(/00 3E 01/)) {
						$scope.carbus.outsideTemp = dataView.getInt16(0  +3)/16;
						$scope.carbus.coilTemp = dataView.getInt16(2  +3)/16;
						busLog('coilTemp');
						busLog('outsideTemp');
					}
				}

				var lastframe = $scope.state[id] || frame;
				lastframe = lastframe.data;

				$scope.state[id] = $scope.state[id] || {};
				angular.extend($scope.state[id],frame);
				$scope.state[id].history = $scope.state[id].history || [];

				if (lastframe !== frame.data) { $scope.state[id].history.unshift(lastframe); }
				if ($scope.state[id].history.length>9) { $scope.state[id].history.pop(); }

				window.localStorage.setItem('infinitude-serial-state',angular.toJson($scope.state));
			}
			/* jshint ignore:end */

			$scope.frames.push(frame);
			if ($scope.frames.length>9) { $scope.frames.shift(); }

			$scope.$apply();
		};
	});
