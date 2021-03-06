(function () {
  'use strict';

  angular
      .module('qrc-center.configuration.controllers')
      .controller('ConfigurationController', ConfigurationController)
      .directive('bindFile', function() {
          return {
              require: 'ngModel',
              restrict: 'A',
              link: function($scope, el, attrs, ngModel) {
                  el.bind('change', function(e) {
                      ngModel.$setViewValue(e.target.files[0]);
                      $scope.$apply();
                  });
                  $scope.$watch(function() {
                      return ngModel.$viewValue;
                  }, function(value) {
                      if (!value) el.val('');
                  });
              }
          };
      })
      .directive('bindFiles', function() {
          return {
              require: 'ngModel',
              restrict: 'A',
              link: function($scope, el, attrs, ngModel) {
                  el.bind('change', function(e) {
                      ngModel.$setViewValue(e.target.files);
                      $scope.$apply();
                  });
                  $scope.$watch(function() {
                      return ngModel.$viewValue;
                  }, function(value) {
                      if (!value) el.val('');
                  });
              }
          };
      })
      .directive('afterRender', ['$timeout', function($timeout) {
          return {
              restrict: 'A',
              link: function(scope, element, attrs) {
                  if (scope.$last === true) $timeout(scope.$eval(attrs.afterRender), 0);
              }
          };
      }]);

  ConfigurationController.$inject = ['QRC', '$scope', '$injector', '$parse', '$timeout', '$http', '$q', 'blockUI'];

  function ConfigurationController(QRC, $scope, $injector, $parse, $timeout, $http, $q, blockUI) {

      var scanRequestsTimer = [];
      var scanRequestCaller = [];
      var cacheConfigurationData = {};
      var isGlobalConfigureBreak = false;
      var isGlobalConfigureBreakDone = false;
      var totalConfigureNum = 0;
      var configuringDoneNum = 0;

      var selectedDevices = [];
      var currentConfigDeviceIndex = 0;
      var CONCURRENT_CONFIG_DEVICE = 20;

      var configTimeStart;

      var localeLabel = {
          de_DE:"Deutsch",
          en_AU:"English (Australia)",
          en_GB:"English (United Kingdom)",
          en_US:"English (United States)",
          es_ES:"Español",
          fr_FR:"Français",
          it_IT:"Italiano",
          pt_PT:"Português",
          ru_RU:"Русский",
          ko_KR:"한국어",
          zh_CN:"中文 (简体)",
          zh_TW:"中文 (繁體)",
          ja_JP:"日本語"
          }

      var configureCases = [
          "GetToken",
          "SettingsPlayerName",
          "SettingsPlayGroup",
          "SettingsNtpServer",
          "SettingsSmilContentUrl",
          "SettingsRebootMode",
          "SettingsRebootTime",
          "SettingsScheduleOn",
          "SettingsScheduleOff",
          "SettingsScheduleOffDays",
          "SettingsScheduleSyncLcd",
          "SettingsRebootTimeOptimized",
          "SettingsScreenOrientation",
          "SettingsOtaXmlUrl",
          "SettingsAppOtaXmlUrl",
          "AudioStreamMusic",
          "AudioStreamNotification",
          "AudioStreamAlarm",
          "AudioStreamSystem",
          "Timezone",
          "SettingsAutoTime",
          "SettingsTimeFormat",
          "SettingsAdbOverTcp",
          "TmpDisableAdb", // MUST after SettingsAdbOverTcp to restart adb server
          "SettingsAdbEnabled",
          "SecurityPasswordEnabled",
          "SecurityPassword",
          "WifiState",
          "WifiNetwork",
          "SettingsProxy",
          "EthernetNetwork",
          "EthernetState",
          "BeaconSettings",
          "NfcState",
          "NfcCardType",
          "NfcReverse",
          "NfcUuidFormat",
          "NfcUuidUpperCase",
          "NfcByteAligned",
          "NfcStripLeading",
          "NfcStripTrailing",
          "TextMessage",
          "FirmwareUpdate",
          "AppUpdate",
          "BootAnimationUpdate",
          "AppUninstall",
          "AppStart",
          "AppStop",
          "RemoteUploadFiles",
          "SettingsLogLocation",
          "SettingsLocale",
          "SettingsPlaylistlogState",
          "DoneConfig",
      ];
      var vm = this;
          vm.configure = {};
          vm.configure.SettingsScheduleOffDays = {};
      
      var getVm = function() { return vm; }

      activate();

      function activate() {
          vm.current_password = "";
          vm.useConfig = {};
          vm.exportConfig = {};

          if (sessionStorage && sessionStorage.cacheConfigurationData) {
              try {
                  cacheConfigurationData = angular.fromJson(sessionStorage.cacheConfigurationData);
              } catch (err) {
                  console.warn("unable to read sessionStorage, clear cacehData.");
                  sessionStorage.removeItem('cacheConfigurationData');
              }
              vm.current_password = cacheConfigurationData.current_password;
              vm.configure = cacheConfigurationData.configure;
              convertConfiguration();
              vm.useConfig = cacheConfigurationData.useConfig;
          }

          vm.ipPattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
          vm.uuidPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
          vm.nidPattern = /^([0-9a-f]{20})$/;
          vm.bidPattern = /^([0-9a-f]{12})$/;
          // For scan tab
          vm.isScanDisabled = true;
          vm.isScanning = false;
          vm.isRemoveRangeBtnShowing = false;
          vm.isNextShow = false;

          vm.addNewRange = addNewRange;
          vm.removeRange = removeRange;
          vm.startScan = startScan;
          vm.hasAndroidDevice = false;
          vm.hasWindowsDevice = false;
          vm.goConfigDev = goConfigDev;
          vm.foundIPs = [];
          vm.scannedDevices = [];
          vm.ipCandidates = [];
          vm.timeCostEstimate = 0;
          
          vm.selectDevCount = 0;

          // For configuration tab
          vm.deviceSelectSize = 3;
          vm.startConfigure = startConfigure;
          vm.onSTableClick = onSTableClick;
          vm.onSTableAllChecked = onSTableAllChecked;
          vm.clearInput = clearInput;
          vm.setFormScope = setFormScope;
          vm.deleteConfig = deleteConfig;
          vm.translateStreamVolume = translateStreamVolume;
          vm.checkInitConfig = checkInitConfig;
          vm.checkEthernetConfig = checkEthernetConfig;
          vm.checkInitWifiConfig = checkInitWifiConfig;
          vm.changeExportMethod = changeExportMethod;
          vm.changeConfigDevice = changeConfigDevice;
          vm.changeAppSelect = changeAppSelect;
          vm.displayScannedDevices = [];
          vm.selectedScannedDevices = [];
          //vm.selectedFinalDevices = [];
          //vm.finalDevices = [];
          vm.scannedModelId = [];
          vm.isStartConfigureDisabled = true;
          vm.isConfiguring = 0;
          vm.isConfigClicked = false;
          vm.startConfigString = 'Start Configuration';
          vm.remoteReboot = remoteReboot;
          vm.remoteResetNfcCardTypesAndReboot = remoteResetNfcCardTypesAndReboot;
          vm.openPlaylistlogFolder = openPlaylistlogFolder;

          vm.countStatus = countStatus;
          vm.scanDevice = scanDevice;
          vm.checkLastResults = checkLastResults;
          vm.onDeviceInfoClick = onDeviceInfoClick;
          vm.onScreenshotClick = onScreenshotClick;
          vm.onLogClick = onLogClick;
          vm.onRemoveClick = onRemoveClick;
          vm.onRemoveAllClick = onRemoveAllClick;
          vm.saveScannedResult = saveScannedResult;
          vm.lastScannedSerialNum = {};
          vm.firmwareFile;
          vm.onFirmwareFileChange = function() {
              console.log(this, vm.firmwareFile);
          };
          vm.appFiles;
          vm.onAppFilesChange = function() {
              console.log(vm.appFiles);
          }
          vm.bootAnmicationFiles;
          vm.onBootAnmicationFilesChange = function() {
              console.log(vm.bootAnmicationFiles);
          }
          vm.remoteUploadFiles;
          vm.onRemoteUploadFilesChange = function() {
              console.log(vm.remoteUploadFiles);
          }
          vm.downloadRRemoteFiles = downloadRRemoteFiles;
          //vm.localStorageName = 'lastResults';
          vm.hasLastScannedResults = false;
          vm.firstCome = true;

          vm.localStorageName = 'RCCLocalStorage';
          if (localStorage) {
              var scannedData = {};
              try {
                  scannedData = JSON.parse(localStorage.getItem(vm.localStorageName));
                  if (!scannedData) {
                      console.warn('No local storage found');
                  }
                  else if (scannedData.scannedDevices && scannedData.lastScannedSerialNum) {
                      for (var i in scannedData.scannedDevices) {
                          var dev = scannedData.scannedDevices[i];
                          dev.status = 'offline';
                          dev.isSelected = false;
                          try {
                              var rest_version = parseInt(dev.restful_api_version.split('.')[0], 2);
                              if(rest_version & 0x02) {
                                dev.os_type = 'windows';
                              } else {
                                dev.os_type = 'android';
                              }
                          } catch (error) {
                              dev.os_type = 'android';
                          }
                          vm.scannedDevices.push(dev);
                      }
                      vm.ipCandidates = (scannedData.ipCandidates||[]).map(function(ip, index) {
                          ip.index = index;
                          return ip;
                      });
                      vm.lastScannedSerialNum = vm.scannedDevices.reduce(function(pool, curr) {
                          pool[curr.serial_number] = curr.index;
                          return pool;
                      }, {});
                      vm.hasLastScannedResults = true;
                  }
                  else {
                      console.warn('Local storage not complete. Clear local storage data');
                      localStorage.removeItem(vm.localStorageName);
                  }
              }
              catch (e) {
                  console.warn('Read local storage error. Clear local storage data');
                  localStorage.removeItem(vm.localStorageName);
              }
          }
          
          vm.localeLabel = localeLabel;
    vm.localeList = [];

          for (var key in localeLabel) {
              if (localeLabel.hasOwnProperty(key)) {
                  vm.localeList.push({
                      locale:key,
                      label:localeLabel[key]
                  });    
              }
          }

          calSTableHeight();


          if (!getLocalIp(onGetIp)){
              onGetIp(null);
          }

          watchScannedDevices();
          watchSliders();
      }

      var NUM_IN_ROUND = 255;//50;
      var SCAN_TIMEOUT = 1000;//30000;
      var RETRY_TIMES = 3;
      var DELAY_PER_ROUND_MS = 200;//2500;

      function checkLastResults() {
          if (vm.hasLastScannedResults && vm.firstCome) {
              vm.startScan(vm.scannedDevices.map(function(dev) {
                  return dev.ip;
              }));
          }
          vm.firstCome = false;
          calSTableHeight();
      }
      function countStatus(status) {
          return vm.scannedDevices.reduce(function(prev, curr) {
              return (curr.status===status ?(prev+1) :prev);
          }, 0);
      }


      // ---------- For Scan Tab ---------- 

      function startScan(ipList) {
          if (vm.isScanning) {
              stopScan();
              return;
          }
          initScan();

          var scannedIPs = Object.create(null);
          var requestNum = 0;
          var responseNum = 0;
          var timeCost = 0;

          //var round = 0;
          var useIpList = ('undefined'!==typeof ipList);
          var std_ip = function(ip) {
              return parseInt(ip.split('.').map(function(n) {
                  return ('00'+n).slice(-3);
              }).join(''));
          };

          // First, count how manu request we need and check if all ip range's format are valid.
          if (useIpList) {
              for (var i=ipList.length-1; 0<=i; i--) {
                  requestNum++;
              }
          }
          else {
              for (var i=0; i<vm.ipCandidates.length; i++) {
                  var range_start = vm.ipCandidates[i].range_start;
                  var range_end = vm.ipCandidates[i].range_end;
                  if (!ValidateIPaddress(range_start)) {
                      printScanError("Start IP '"+ range_start +"' is invalid.");
                      stopScan();
                      return;
                  }
                  if (!ValidateIPaddress(range_end)) {
                      printScanError("End IP '"+ range_end +"' is invalid.");
                      stopScan();
                      return
                  };
                  if (range_start.replace(/\.[\d]+\.[\d]+$/, '') !== range_end.replace(/\.[\d]+\.[\d]+$/, '')) {
                      printScanError("IPs' first two digits need to be the same");
                      stopScan();
                      return;
                  }
                  if (std_ip(range_end) < std_ip(range_start)) {
                      printScanError("Start IP '" + range_start +
                                     "' should be smaller than End IP '"+ range_end +"'");
                      stopScan();
                      return;
                  }
                  var ip_prefix = range_start.replace(/[\d]+\.[\d]+$/, ''),
                      ip1s = range_start.split('.'),
                      ip2s = range_end.split('.'),
                      ip1_3 = parseInt(ip1s[2]),
                      ip1_4 = parseInt(ip1s[3]),
                      ip2_3 = parseInt(ip2s[2]),
                      ip2_4 = parseInt(ip2s[3]);
                  for (var ip3=ip1_3; ip3<=ip2_3; ip3++) {
                      var ip_head = (ip_prefix+ip3+'.');
                      for (var ip4=(ip3===ip1_3 ?ip1_4 :1),
                          ip4ub=(ip3===ip2_3 ?ip2_4 :255);
                          ip4<=ip4ub; ip4++) {
                          var targetIP = (ip_head+ip4);
                          if (targetIP in scannedIPs) continue;
                          scannedIPs[targetIP] = 0;
                          requestNum++;
                      }
                  }
              }
          }
          timeCost = ((requestNum-1)*DELAY_PER_ROUND_MS+RETRY_TIMES*SCAN_TIMEOUT);
          vm.timeCostEstimate = timeCost/1000;
          // Then, do the real scan
          scannedIPs = Object.create(null);
          var key = 'abcde';
          var myHashCode = QRC.getHashCode(key);
          timeCost = 0;

          //Testing devices
          /*
          for (var k=0;k<51;k++) {
              appendScannedDevice({data:{results:{model_id:'FHD123',player_name:'AAA', serial_number:'AAA'}}}, '192.168.1.131');
              appendScannedDevice({data:{results:{model_id:'TD123',player_name:'BBB', serial_number:'BBB'}}}, '192.168.1.171');
              appendScannedDevice({data:{results:{model_id:'TD123',player_name:'CCC', serial_number:'BBB'}}}, '192.168.1.172');
              appendScannedDevice({data:{results:{model_id:'TD123',player_name:'DDD', serial_number:'BBB'}}}, '192.168.1.178');
              appendScannedDevice({data:{results:{model_id:'TD123',player_name:'EEE', serial_number:'BBB'}}}, '192.168.1.209');
          }
          */

          if (useIpList) {
              for (var i=0, len=ipList.length; i<len; i++) {
                  if (!vm.isScanning) break;
                  var targetIP = ipList[i];
                  if (targetIP in scannedIPs) continue;
                  scannedIPs[targetIP] = 0;

                  var req = $timeout(function(scanIp) {
                      var caller = $q.defer();

                      $http.get(("http://"+scanIp+":8080/v1/public/info?key="+key), {
                          timeout: SCAN_TIMEOUT
                      }).then(successScanFn, errorScanFn);
                      $timeout(function(caller) {caller.resolve()}, SCAN_TIMEOUT, true, caller);
                      scanRequestCaller.push(caller);
                      /*
                      QRC.setTargetIpAddress(targetIP);
                      QRC.getPublicInfo(key).then(successScanFn, errorScanFn);
                      */

                  }, (i*DELAY_PER_ROUND_MS), true, targetIP);
                  scanRequestsTimer.push(req);
              }
          }
          else {
              var delayIndex = 0;
              for (var i=0; i<vm.ipCandidates.length; i++) {
                  if (!vm.isScanning) break;

                  var range_start = vm.ipCandidates[i].range_start;
                  var range_end = vm.ipCandidates[i].range_end;

                  var ip_prefix = range_start.replace(/[\d]+\.[\d]+$/, ''),
                      ip1s = range_start.split('.'),
                      ip2s = range_end.split('.'),
                      ip1_3 = parseInt(ip1s[2]),
                      ip1_4 = parseInt(ip1s[3]),
                      ip2_3 = parseInt(ip2s[2]),
                      ip2_4 = parseInt(ip2s[3]);
                  for (var ip3=ip1_3; ip3<=ip2_3; ip3++) {
                      var ip_head = (ip_prefix+ip3+'.');
                      for (var ip4=(ip3===ip1_3 ?ip1_4 :1),
                          ip4ub=(ip3===ip2_3 ?ip2_4 :255);
                          ip4<=ip4ub; ip4++) {
                          var targetIP = (ip_head+ip4);
                          if (targetIP in scannedIPs) continue;
                          scannedIPs[targetIP] = 0;

                          var dev = getDeviceByIp(targetIP);
                          if (dev) dev.status = 'processing';

                          var req = $timeout(function(scanIp) {
                              var caller = $q.defer();

                              $http.get("http://" + scanIp + ":8080/v1/public/info?key=" + key,
                                        {timeout: caller.promise}).then(successScanFn, errorScanFn);
                              $timeout(function(caller) {caller.resolve()}, SCAN_TIMEOUT, true, caller);
                              scanRequestCaller.push(caller);
                              /*
                              QRC.setTargetIpAddress(targetIP);
                              QRC.getPublicInfo(key).then(successScanFn, errorScanFn);
                              */

                          }, (delayIndex++*DELAY_PER_ROUND_MS), true, targetIP);
                          scanRequestsTimer.push(req);
                      }
                  }
              }
          }

          function successScanFn(data) {
              if (data && data.data && data.data.results &&
                  data.data.results.hash_code == myHashCode) {
                  var parser = document.createElement('a');
                  parser.href = data.config.url;

                  appendScannedDevice(data, parser.hostname);
                  printAndAppendScanResult("Found Target IP: " + parser.hostname + ", keep scanning..");

                  vm.scannedDevices[vm.lastScannedSerialNum[data.data.results.serial_number]].status = 'online';
              }
              responseNum++;
              //console.log("responseNum:" + responseNum);
              checkScanIsDone();

          }
          function errorScanFn(data) {
              var parser = document.createElement('a');
              parser.href = data.config.url;
              var ip = parser.hostname;

              if (vm.isScanning && (++scannedIPs[ip] < RETRY_TIMES)) {
                  var req = $timeout(function(scanIp) {
                      var caller = $q.defer();
                      $http.get("http://" + scanIp + ":8080/v1/public/info?key=" + key,
                          {timeout: caller.promise}).then(successScanFn, errorScanFn);
                      $timeout(function(caller) {caller.resolve()}, SCAN_TIMEOUT, true, caller);
                      scanRequestCaller.push(caller);
                  }, 0, true, ip);
                  scanRequestsTimer.push(req);
                  return;
              }

              if (ip == "192.168.1.25") {
                  console.log("error response from targetIP:" + targetIP);
              }
              vm.scannedDevices.forEach(function(dev) {
                  if (dev.ip != ip) return;
                  dev.status = 'offline';
              });

              responseNum++;
              //console.log("responseNum:" + responseNum);
              checkScanIsDone();
          }
          function checkScanIsDone() {
              if (responseNum == requestNum) {
                  printAndAppendScanResult("Done scan devices. All found devices:" 
                      +vm.scannedDevices.reduce(function(prev, curr) {
                          if (curr.status === 'online') prev.push(curr.ip);
                          return prev;
                      }, []).join(", "));
                  stopScan();
              }
          }
      }
      function stopScan() {
          for (var r in scanRequestsTimer) {
              $timeout.cancel(scanRequestsTimer[r]);
          }
          for (var r in scanRequestCaller) {
              scanRequestCaller[r].resolve();
          }
          vm.isScanning = false;
          if (vm.scannedDevices.length > 0) {
              vm.isNextShow = true;
          }

          for (var i=vm.scannedDevices.length-1; 0<=i; i--) {
              var dev = vm.scannedDevices[i];
              if (dev.status !== 'online') dev.status = 'offline';
          }

          printAndAppendScanResult("Stop Scaning.");
          saveScannedResult();
      }

      function goConfigDev() {
          vm.tabConfigDevActive = true;
          stopScan();
      }

      function initScan() {
          vm.isScanning = true;
          vm.isNextShow = false;
          vm.hasAndroidDevice = false;
          vm.hasWindowsDevice = false;
          vm.foundIPs = vm.scannedDevices.map(function(dev) { return dev.ip; });
          scanRequestsTimer = [];
          scanRequestCaller = [];

          vm.isStartConfigureDisabled = true;
          calSTableHeight();
          clearScanResult();
      }

      function getDeviceByIp(ip) {
          for (var i=vm.scannedDevices.length-1; 0<=i; i--) {
              var dev = vm.scannedDevices[i];
              if (dev.ip === ip) return dev;
          }
          return null;
      }

      function scanDevice(row) {
          var key = 'abcde';
          var myHashCode = QRC.getHashCode(key);
          row.status = 'processing';
          $timeout(function(scanIp) {
              var caller = $q.defer();

              $http.get("http://" + scanIp + ":8080/v1/public/info?key=" + key,
                  {timeout: caller.promise}).then(function(data) {
                      if (data && data.data && data.data.results &&
                          data.data.results.hash_code == myHashCode) {
                          var parser = document.createElement('a');
                          parser.href = data.config.url;

                          appendScannedDevice(data, parser.hostname);
                          printAndAppendScanResult("Found Target IP: " + parser.hostname + ", keep scanning..");

                          vm.scannedDevices[vm.lastScannedSerialNum[data.data.results.serial_number]].status = 'online';
                      }
                  }, function(data) {
                      vm.scannedDevices.forEach(function(dev) {
                          if (dev.ip != scanIp) return;
                          dev.status = 'offline';
                      });
                  });
              $timeout(function(caller) {caller.resolve()}, SCAN_TIMEOUT, true, caller);
          }, 0, true, row.ip);
      }

      function appendScannedDevice(data, ipAddress) {
          var result = data.data.results;
          var model_name = result.model_name;
          var serial_number = result.serial_number;
          var isInModelIdArray = false;
          result.model_id = model_name ? model_name : result.model_id;
          
          try {
              var rest_version = parseInt(result.restful_api_version.split('.')[0], 2);
              if(rest_version & 0x02) {
                console.log(result.model_id, "Windows device");
                result.os_type = 'windows';
                vm.hasWindowsDevice = true;
              } else {
                console.log(result.model_id, "Android device");
                result.os_type = 'android';
                vm.hasAndroidDevice = true;
              }
          } catch (error) {
              console.log(ipAddress, error, result);
              result.os_type = 'android';
              vm.hasAndroidDevice = true;
          }
          
          for (var i in vm.scannedModelId) {
              if (vm.scannedModelId[i] == result.model_id){
                  isInModelIdArray = true;
                  break;
              }
          }
          if (!isInModelIdArray) {
              vm.scannedModelId.push(result.model_id);
          }
          if ('undefined' === typeof vm.lastScannedSerialNum[serial_number]) {
              var index = vm.scannedDevices.length;
              vm.lastScannedSerialNum[serial_number] = index;
              vm.foundIPs.push(ipAddress);
              result.ip = ipAddress;
              result.index = index;
              vm.scannedDevices.push(result);
              calSTableHeight();
          }
          else {
              var info = vm.scannedDevices[vm.lastScannedSerialNum[serial_number]];
              info.player_name = result.player_name;
              info.ip = ipAddress;
              info.model_id = result.model_id;
              info.restful_api_version = result.restful_api_version;
              info.os_type = result.os_type;
          }
      }

      function saveScannedResult() {
          localStorage.setItem(vm.localStorageName, JSON.stringify({
              ipCandidates: vm.ipCandidates.reduce(function(pool, curr) {
                  if (curr.range_start || curr.range_end) pool.push(curr)
                  return pool
              }, []).map(function(ip, index) {
                  ip.index = index;
                  return ip;
              }),
              scannedDevices: vm.scannedDevices,
              lastScannedSerialNum: vm.lastScannedSerialNum
          }));
      }
      
      function onLogClick(row, inx) {
          var index = vm.lastScannedSerialNum[row.serial_number],
              device = vm.scannedDevices[index];
          QRC.setTargetIpAddress(device.ip, device.index);
          QRC.getToken((vm.current_password||'12345678'), device.index).then(function(data) {
                  var accessToken = data.data.access_token;
                  QRC.setTargetAuthToken(accessToken, device.index);
                  QRC.getSettings("log_location", device.index)
                          .then(function(data) {
                              data = data.data;
                              console.log(data);
                              if (data.value == "0" || data.value == "1") {
                                  var displayMsg;
                                  if(data.value == 0) {
                                      displayMsg = "Would you like to open log directory?";
                                  } else {
                                      displayMsg = "Would you like to open log directory?";
                                  }
                                  //save log to internal storage
                                  $('body').append($('<div>')
                                  .hide()
                                  .attr('id', 'logdialog')
                                  .append($('<div>')
                                      .addClass('box')
                                      .append($('<div>')
                                              .addClass('form-group')
                                              .append($('<label>')
                                              .addClass('control-label-left')
                                              .html(displayMsg)
                                             )        
                                      )
                                      .append($('<button>')
                                              .addClass('btn btn-primary')
                                              .html("OK")
                                              .on('click', function() { 
                                                      if(data.value == "0") {                                                                                                                                             window.open('http://'+device.ip+':8080/mnt/internal_storage/_internal_debug_log/'); 
                                                      } else {
                                                          window.open('http://'+device.ip+':8080/mnt/external_sd/_sd_debug_log/');
                                                      }
                                                      $(logdialog).fadeOut(function() {
                                                      $(logdialog).remove();
                                                      })
                                                  })
                                      )
                                      .append($('<button>')
                                              .addClass('btn btn-primary pull-right')
                                              .html("Cancel")
                                              .on('click', function(e) { 
                                                      $(logdialog).fadeOut(function() {
                                                      $(logdialog).remove();
                                                      })
                                              })
                                      )
                                      .on('click', function(e) {
                                      console.log(e);
                                      e.stopPropagation();})
                                  )               
                                  .on('click', function() {
                                      $(this).fadeOut(function() {
                                          $(this).remove();
                                      })
                                  })
                                  .fadeIn()
                                  );
                              } else if (data.value == "3") {
                                  //Do save log
                                  $('body').append($('<div>')
                                      .hide()
                                      .attr('id', 'progress')
                                      .append($('<div>')
                                          .addClass('box')
                                          .html('Saving log...')
                                      )
                                      .on('click', function() {
                                          $(this).fadeOut(function() {
                                              $(this).remove();
                                          })
                                      })
                                      .fadeIn()
                                  );
                                  var xhr = new XMLHttpRequest();
                                  xhr.open('GET', ('http://'+device.ip+':8080/v1/task/log'), true);
                                  xhr.setRequestHeader('Authorization', ('Bearer '+accessToken));
                                  xhr.responseType = 'arraybuffer';
                                  xhr.onload = function() {
                                      var elementExists = document.getElementById("progress");
                                      if(elementExists) {
                                          $(progress).fadeOut(function() {
                                              $(progress).remove();
                                          })
                                      }
                                      var data = this.response;
                                      var type = xhr.getResponseHeader('Content-Type');
                                      var blob = new Blob([data], { type: type });
                                      var curDate = new Date();
                                      var month = curDate.getMonth() + 1;
                                      if(month < 10) {
                                          month = "0" + month;
                                      }
                                      var days = curDate.getDate();
                                      if(days < 10) {
                                          days = "0" + days;
                                      }
                                      saveAs(blob, "" + curDate.getFullYear() + month+days + "_" + curDate.getHours()+curDate.getMinutes()+curDate.getSeconds() + "_log.zip");
                                  };
                                  xhr.send();
                              } else {
                                  console.log("Unknown log location:" + data.value);
                                  $('body').append($('<div>')
                                  .hide()
                                  .attr('id', 'progress')
                                  .append($('<div>')
                                      .addClass('box')
                                      .html("Unknown log location:" + data.value)
                                  )
                                  .on('click', function() {
                                      $(this).fadeOut(function() {
                                          $(this).remove();
                                      })
                                  })
                                  .fadeIn()
                                  );
                              }
                          }, function(data) {
                              data = data.data;
                              $('body').append($('<div>')
                                  .hide()
                                  .attr('id', 'progress')
                                  .append($('<div>')
                                      .addClass('box')
                                      .html(JSON.stringify(data))
                                  )
                                  .on('click', function() {
                                      $(this).fadeOut(function() {
                                          $(this).remove();
                                      })
                                  })
                                  .fadeIn()
                              );
                          });
          }, function(e) {
                  $('body').append($('<div>')
                      .hide()
                      .attr('id', 'progress')
                      .append($('<div>')
                          .addClass('box')
                          .html('Please set device password')
                      )
                      .on('click', function() {
                          $(this).fadeOut(function() {
                              $(this).remove();
                          })
                      })
                      .fadeIn()
                  );
              });
      }

      function onDeviceInfoClick(row, inx) {
          var index = vm.lastScannedSerialNum[row.serial_number],
              device = vm.scannedDevices[index];
          QRC.setTargetIpAddress(device.ip, device.index);
          QRC.getToken((vm.current_password||'12345678'), device.index).then(function(data) {
                  var accessToken = data.data.access_token;
                  QRC.setTargetAuthToken(accessToken, device.index);
                  QRC.getInfo(device.index)
                          .then(function(data) {
                              data = data.data.results;
                              console.log(data);
                              $('body').append($('<div>')
                                  .hide()
                                  .attr('id', 'progress')
                                  .append($('<div>')
                                      .addClass('box')
                                      .append($('<table>')
                                          .append($('<tr>')
                                              .append($('<td>').html("Item--------------------------------- "))
                                              .append($('<td>').html("Value---------------------------------"))
                                          )
                                          .append($('<tr>')
                                              .append($('<td>').html("Device model:"))
                                              .append($('<td>').html(data.model_id))
                                              [data.model_name ?'hide' :'show']()
                                          )
                                          .append($('<tr>')
                                              .append($('<td>').html("Device model:"))
                                              .append($('<td>').html(data.model_name))
                                              [data.model_name ?'show' :'hide']()
                                          )
                                          .append($('<tr>')
                                              .append($('<td>').html("OS type:"))
                                              .append($('<td>').html(data.os_type))
                                              [data.os_type ?'show' :'hide']()
                                          )
                                          .append($('<tr>')
                                              .append($('<td>').html("Firmware version:"))
                                              .append($('<td>').html(data.fw_version))
                                              [data.fw_version ?'show' :'hide']()
                                          )
                                          .append($('<tr>')
                                              .append($('<td>').html("RESTful APIs version:"))
                                              .append($('<td>').html(data.restful_api_version))
                                              [data.restful_api_version ?'show' :'hide']()
                                          )
                                          .append($('<tr>')
                                              .append($('<td>').html("Serial number:"))
                                              .append($('<td>').html(data.serial_number))
                                              [data.serial_number ?'show' :'hide']()
                                          )
                                          .append($('<tr>')
                                              .append($('<td>').html("ETH MAC:"))
                                              .append($('<td>').html(data.eth_mac))
                                              [data.eth_mac ?'show' :'hide']()
                                          )
                                          .append($('<tr>')
                                              .append($('<td>').html("WIFI MAC:"))
                                              .append($('<td>').html(data.wifi_mac))
                                              [data.wifi_mac ?'show' :'hide']()
                                          )
                                          .append($('<tr>')
                                              .append($('<td>').html("UUID:"))
                                              .append($('<td>').html(data.device_uuid))
                                              [data.device_uuid ?'show' :'hide']()
                                          )
                                          .append($('<tr>')
                                              .append($('<td>').html("CPU usage:"))
                                              .append($('<td>').html(data.cpu_usage_percent))
                                              [data.cpu_usage_percent ?'show' :'hide']()
                                          )
                                          .append($('<tr>')
                                              .append($('<td>').html("Memory(free/total):"))
                                              .append($('<td>').html(data.available_memory_size_mb + "/" + data.total_memory_size_mb + " MB"))
                                              [data.available_memory_size_mb ?'show' :'hide']()
                                          )
                                          .append($('<tr>')
                                              .append($('<td>').html("Storage(free/total):"))
                                              .append($('<td>').html(data.available_storage_size_mb + "/" + data.total_storage_size_mb + " MB"))
                                              [data.available_storage_size_mb ?'show' :'hide']()
                                          )
                                          .append($('<tr>')
                                              .append($('<td>').html("IP address:"))
                                              .append($('<td>').html(data.ip_address))
                                              [data.ip_address ?'show' :'hide']()
                                          )
                                          .append($('<tr>')
                                              .append($('<td>').html("Up time:"))
                                              .append($('<td>').html(data.up_time))
                                              [data.up_time ?'show' :'hide']()
                                          )
                                      )
                                  )
                                  .on('click', function() {
                                      $(this).fadeOut(function() {
                                          $(this).remove();
                                      })
                                  })
                                  .fadeIn()
                              );
                          }, function(data) {
                              data = data.data;
                              $('body').append($('<div>')
                                  .hide()
                                  .attr('id', 'progress')
                                  .append($('<div>')
                                      .addClass('box')
                                      .html(JSON.stringify(data))
                                  )
                                  .on('click', function() {
                                      $(this).fadeOut(function() {
                                          $(this).remove();
                                      })
                                  })
                                  .fadeIn()
                              );
                          });
          }, function(e) {
                  $('body').append($('<div>')
                      .hide()
                      .attr('id', 'progress')
                      .append($('<div>')
                          .addClass('box')
                          .html('Please set device password')
                      )
                      .on('click', function() {
                          $(this).fadeOut(function() {
                              $(this).remove();
                          })
                      })
                      .fadeIn()
                  );
              });
      }

      function onScreenshotClick(row, inx) {
          var index = vm.lastScannedSerialNum[row.serial_number],
              device = vm.scannedDevices[index];
          QRC.setTargetIpAddress(device.ip, device.index);
          QRC.getToken((vm.current_password||'12345678'), device.index)
              .then(function(data) {
                  var $box = $('<div>').addClass('box');
                  var $mask = $('<div>');
                  $('body').append($mask
                      .hide()
                      .attr('id', 'screenshot')
                      .append($box)
                      .fadeIn()
                  );
                  var xhr = new XMLHttpRequest();
                  xhr.open('GET', ('http://'+device.ip+':8080/v1/task/screenshot'), true);
                  xhr.setRequestHeader('Authorization', ('Bearer '+data.data.access_token));
                  xhr.responseType = 'arraybuffer';
                  xhr.onload = function() {
                      var data = this.response,
                          uInt8Arr = new Uint8Array(data),
                          len = uInt8Arr.length,
                          bStr = new Array(len);
                      while (len--) bStr[len] = String.fromCharCode(uInt8Arr[len]);
                      $box
                          .append($('<img>')
                              .attr('src', ('data:image/jpeg;base64,'+btoa(bStr.join(''))))
                          )
                          .on('click', function(e) {
                              e.stopPropagation();
                          });
                      $mask.on('click', function() {
                          $(this).fadeOut(function() {
                              $(this).remove();
                          })
                      });
                  };
                  xhr.send();
              }, function(e) {
                  $('body').append($('<div>')
                      .hide()
                      .attr('id', 'progress')
                      .append($('<div>')
                          .addClass('box')
                          .html('Please set device password')
                      )
                      .on('click', function() {
                          $(this).fadeOut(function() {
                              $(this).remove();
                          })
                      })
                      .fadeIn()
                  );
              });
      }

      function onRemoveClick(row, inx) {
          var serial_number = row.serial_number;
          var index = vm.lastScannedSerialNum[serial_number];
          vm.scannedDevices.splice(index, 1);
          vm.displayScannedDevices.splice(inx, 1);
          delete vm.lastScannedSerialNum[serial_number];
          for (var i=vm.scannedDevices.length-1; 0<=i; i--) {
              var dev = vm.scannedDevices[i];
              dev.index = i;
              vm.lastScannedSerialNum[dev.serial_number] = i;
          }
          saveScannedResult();
          calSTableHeight();
      }

      function onRemoveAllClick() {
          for (var i=vm.displayScannedDevices.length-1; 0<=i; i--) {
              onRemoveClick(vm.displayScannedDevices[i], i);
          }
      }

      function printScanError(msg, data, error) {
          vm.deviceScanFailResult = 
              vm.deviceScanFailResult?vm.deviceScanFailResult:""  + (vm.deviceScanFailResult? "\n": "") + msg;
          if (data && data.data) {
              var jsonObj = data.data
              vm.deviceScanFailResult = vm.deviceScanFailResult + 
                  "\n\nHTTP " + data.status + " " + data.statusText + "\n" +
                  "Responsed JSON content: " + JSON.stringify(jsonObj);
          }
          if (error) {
              vm.deviceScanFailResult += "\n\nError:\n"
              vm.deviceScanFailResult += error.message + "\n";
              vm.deviceScanFailResult += error.stack + "\n";
          }

          vm.deviceScanFailResult += "\nPlease check console log for more information.\n"
      }

      function printAndAppendScanResult(msg, data) {
          vm.deviceScanResult = vm.deviceScanResult + (vm.deviceScanResult? "\n": "") + msg;
          if (data) {
              vm.deviceScanResult = vm.deviceScanResult + "\n" + JSON.stringify(data.data, null, 2);
          }

      }

      function clearScanResult() {
          vm.deviceScanResult = "";
          vm.deviceScanFailResult = "";
      }

      function addNewRange() {
          vm.ipCandidates.push({
              index: vm.ipCandidates.length
          });
          checkRemoveRangeButton();
      }

      function removeRange(item) {
          for (var i=vm.ipCandidates.length-1; 0<=i; i--) {
              if (vm.ipCandidates[i].index == item.index) {
                  vm.ipCandidates.splice(i, 1);
                  for (var j=vm.ipCandidates.length-1; 0<=j; j--) {
                      vm.ipCandidates[i].index = j;
                  }
                  saveScannedResult();
                  break;
              }
          }
          checkRemoveRangeButton();
      }

      function checkRemoveRangeButton() {
          if (vm.ipCandidates.length <= 1) {
              vm.isRemoveRangeBtnShowing = false;
          } else {
              vm.isRemoveRangeBtnShowing = true;
          }
      }

      // ---------- End of For Scan Tab ---------- 

      // ---------- For Configure Tab ---------- 
      function remoteReboot() {
          var devices = [];
          for (var devIdx in vm.scannedDevices) {
              if (vm.scannedDevices[devIdx].isSelected) {
                  devices.push(vm.scannedDevices[devIdx]);
              }
          }
          devices.forEach(function(device) {
              QRC.setTargetIpAddress(device.ip, device.index);
              QRC.getToken((vm.current_password||'12345678'), device.index)
                  .then(function(data) {
                      QRC.setTargetAuthToken(data.data.access_token, device.index);
                      QRC.reboot(device.index);
                  }, function(e) { console.error(e); });
          });
      }

      function remoteResetNfcCardTypesAndReboot() {
          var devices = [];
          for (var devIdx in vm.scannedDevices) {
              if (vm.scannedDevices[devIdx].isSelected) {
                  devices.push(vm.scannedDevices[devIdx]);
              }
          }
          devices.forEach(function(device) {
              QRC.setTargetIpAddress(device.ip, device.index);
              QRC.getToken((vm.current_password||'12345678'), device.index)
                  .then(function(data) {
                      QRC.setTargetAuthToken(data.data.access_token, device.index);
                      return QRC.setNfcCardType(0, device.index);
                  })
                  .then(function() {
                      return QRC.reboot(device.index);
                  })
                  .catch(function(e) { console.error(e); });
          });
      }

      function openPlaylistlogFolder() {
          console.log('openPlaylistlogFolder');
          for (var devIdx in vm.scannedDevices) {
              if (vm.scannedDevices[devIdx].isSelected) {
                  var url = QRC.buildUrl("/mnt/internal_storage/_internal_playlist_log/", devIdx);
                  console.log(url);
                  return window.open(url, '_blank');
              }
          }
      }

      function downloadRRemoteFiles() {
          console.log('downloadRRemoteFiles');
          for (var devIdx in vm.scannedDevices) {
              if (vm.scannedDevices[devIdx].isSelected) {
                  var url = QRC.buildUrl("/mnt/internal_storage/remotefiles/", devIdx);
                  console.log(url);
                  return window.open(url, '_blank');
              }
          }
      }

      function clearInput() {
          vm.current_password = "";
          vm.configure = {};
          vm.useConfig = {};
          if (sessionStorage) {
              sessionStorage.removeItem('cacheConfigurationData');
          }
          cacheConfigurationData = {};

      }

      function onSTableClick(row) {
          if ((row.status !== 'online') || (row.os_type != vm.config_device_os)) {
              row.isSelected = false;
              return;
          }

          if (row.isSelected) {
              row.isSelected = false;
          } else {
              row.isSelected = true;
          }

          vm.scannedDevices[row.index].isSelected = row.isSelected;
          if (row.isSelected) {
              checkAllDisplayDevicesSelected();
          } else {
              vm.STableSelectAllDevices = false;
          } 
          checkReadyToConfigure();
      }
      function onSTableAllChecked() {
          var selected = vm.STableSelectAllDevices;
          for (var i in vm.displayScannedDevices) {
              var dev = vm.displayScannedDevices[i];
              if (dev.status !== 'online') continue;
              dev.isSelected = selected;
              vm.scannedDevices[dev.index].isSelected = selected;
          }
          checkReadyToConfigure();
      }

      function calSTableHeight() {
          var HEIGHT_MAX_SIZE = 15;
          if (!vm.scannedDevices.length) {
              vm.deviceSelectSize = 10;
          } else if (vm.scannedDevices.length < HEIGHT_MAX_SIZE) {
              vm.deviceSelectSize = 7 + (vm.scannedDevices.length * 3);
          } else {
              vm.deviceSelectSize = 7 + (HEIGHT_MAX_SIZE * 3);
          }
          vm.STableStyle={'height':vm.deviceSelectSize+'em'};
      }

      function startConfigure() {
          // fix closure issue
          window.rccConfigure = vm.configure;

          if (vm.isConfiguring) {
              stopConfigure();
              return;
          }

          if (!validateConfigInput()) {
              return;
          }

          if (!checkDeviceSelected() && vm.remote_or_export=='remote') {
              printConfigureError("Unable to configure. Please select at leaset one device.");
              return;
          }
          configTimeStart = new Date();
          initStartConfigure();

          if (vm.remote_or_export=='remote') {
              // For remotely configure
              for (var devIdx in vm.scannedDevices) {
                  if (vm.scannedDevices[devIdx].isSelected) {
                      selectedDevices.push(vm.scannedDevices[devIdx]);
                      totalConfigureNum += configureCases.length;
                  }
              }
              for (var i = 0; i < CONCURRENT_CONFIG_DEVICE + 1; i++) {
                  if (currentConfigDeviceIndex < selectedDevices.length) {
                      tryConfigDevice(currentConfigDeviceIndex);
                      currentConfigDeviceIndex++;
                  }
              }
          } else {
              // For export to USB
              //create a dummy device for export configuraiton
              var result = {model_id:'LocalDev',player_name:'configBot', serial_number:'123'};
              result.ip = 'localhost';
              result.index = 0;
              selectedDevices.push(result);
              totalConfigureNum += configureCases.length;
              tryConfigDevice(currentConfigDeviceIndex);
          }
      }

      function configOneMoreDevice() {
          if (currentConfigDeviceIndex < selectedDevices.length) {
              tryConfigDevice(currentConfigDeviceIndex);
              currentConfigDeviceIndex++;
          }
      }

      function tryConfigDevice(devIdx) {
          if (devIdx < selectedDevices.length) {
              selectedDevices[devIdx].isConfigFailed = false;
              selectedDevices[devIdx].isConfigComplete = false;
              if (isGlobalConfigureBreak) return;

              runConfigureCase(0, selectedDevices[devIdx]);

          }
      }

      function initStartConfigure() {
          var bui = blockUI.instances.get('BlockUIForConfigure');
          bui.start('Waiting for Configuration Complete...');
          cacheConfigurationData = {};
          cacheConfigurationData.current_password = vm.current_password;
          cacheConfigurationData.configure = vm.configure;
          cacheConfigurationData.useConfig = vm.useConfig;
          if (sessionStorage) {
              sessionStorage.cacheConfigurationData = angular.toJson(cacheConfigurationData);
          }

          isGlobalConfigureBreak = false;
          isGlobalConfigureBreakDone = false;
          vm.isConfiguring = 1;

          clearConfigureResult();

          totalConfigureNum = 0;
          configuringDoneNum = 0;

          currentConfigDeviceIndex = 0;

          selectedDevices = [];
      }

      function stopConfigure() {
          var bui = blockUI.instances.get('BlockUIForConfigure');
          if (totalConfigureNum == configuringDoneNum) {
              bui.stop();
              printAndAppendConfigureResult("Configuration Stop.");
              vm.isConfiguring = 0;
          } else {
              bui.stop();
              bui.start("Stopping Configuration...");
              vm.isConfiguring = 2;
          }

          isGlobalConfigureBreak = true;

      }

      function openAllConfigAccordion(open) {
          for (var i in vm.accordion) {
              vm.accordion[i] = open;
          }
      }

      function validateConfigInput() {
          vm.isConfigClicked = true;
          var configForm = vm.formScope.ConfigForm;
          if (configForm.$valid) {
              return true;
          }

          $scope.$broadcast('show-errors-check-validity');
          //openAllConfigAccordion(true);
          //printConfigureError("Following input is invalid.");
          for (var item in configForm) {
              if (configForm[item] && configForm[item]["$invalid"]) {
                  if (document.getElementsByName(item)[0]) {
                      var parent = angular.element(document.getElementsByName(item)[0]).scope().$parent;
                      if (parent && 
                          typeof parent.isOpen != 'undefined' &&
                          !parent.isOpen) {
                          parent.isOpen = true;
                      }
                  }
                  //printConfigureError(item);
              }
          }
          return false;


      }
      function setFormScope(scope) {
          vm.formScope = scope;
      }

      function checkDeviceSelected() {
          for (var i in vm.scannedDevices) {
              if (vm.scannedDevices[i].isSelected) {
                  return true;
              }
          }
          return false;
      }
      
      function getSystemLocale(locales) {
          console.log("getSystemLocale");
          var ret_locale = undefined;
          for (var key in locales) {
              if (locales.hasOwnProperty(key)) {
                  var find_locale = undefined;
                  for (var prop in vm.localeList) {
                    if (vm.localeList.hasOwnProperty(prop)) { 
                          if(vm.localeList[prop].locale === key) {
                              find_locale = vm.localeList[prop];
                          }
                    }
                  }
                  if(find_locale == undefined) {
                      console.log("find_locale", find_locale);
                      //add current key to localeList
                      var lang = key.split("_");
                      if(lang.length == 2) {
                          var new_locale = {
                              locale:key,
                              label:isoLangs[lang[0]].nativeName
                          }
                          console.log("push new locale", new_locale);
                          vm.localeList.push(new_locale);
                          find_locale = new_locale;
                      }
                  }
                  if(locales[key]) {
                      //current system locale settings
                      ret_locale = find_locale;
                  }  
              }
          }
          console.log(ret_locale);
          return ret_locale;
      }

      function checkReadyToConfigure() {
          var status = false,
              count = 0,
              devIndex = -1;
          var beaconData = {};
          var beaconState = false;
          for (var i in vm.scannedDevices) {
              if (vm.scannedDevices[i].isSelected) {
                  devIndex = i;
                  ++count;
                  status = true;
              }
          }
          vm.selectDevCount = count;
          vm.isStartConfigureDisabled = !status;
          vm.configure = {};
          function getAndroidDeviceConfiguration(steps) {
              steps.push(function(callback) {
                      QRC.getSettings('', device.index).then(function(data) {
                          data = data.data.results;
                          vm.configure.Timezone = data.timezone;
                          vm.configure.SettingsAutoTime = (data.auto_time_enabled ?'enable' :'disable');
                          vm.configure.SettingsTimeFormat = (data['24_time_format']=='enabled' ?'enable' :'disable');
                          vm.configure.SettingsPlayerName = data.player_name;
                          vm.configure.SettingsPlayGroup = data.play_group;
                          vm.configure.SettingsNtpServer = data.ntp_server;
                          vm.configure.SettingsSmilContentUrl = data.content_url;
                          vm.configure.SettingsAdbEnabled = (data.adb_enabled ?'enable' :'disable');
                          vm.configure.SettingsAdbOverTcp = (data.adb_over_tcp ?'enable' :'disable');
                          vm.configure.SettingsRebootMode = data.schedule_reboot_mode;
                          vm.configure.SettingsRebootTimeOptimized = (data.is_reboot_optimized ?'enable' :'disable');
                          vm.configure.SettingsScreenOrientation = data.screen_orientation;
                          vm.configure.SettingsOtaXmlUrl = data.ota_xml_url;
                          vm.configure.SettingsAppOtaXmlUrl = data.app_ota_xml_url;
                          vm.configure.SettingsLogLocation = data.log_location;
                          var current_locale = getSystemLocale(data.locale);
                          if(current_locale) {
                              vm.configure.SettingsLocale = current_locale;
                          }
                          vm.configure.SettingsScheduleOffDays = data.schedule_off_days;
                          if(vm.configure.SettingsScheduleOffDays == undefined) {

                              vm.configure.SettingsScheduleOffDays = {};
                          }
                          if(data.schedule_led_off) {
                              vm.configure.SettingsScheduleSyncLcd = "true";
                          } else {
                              vm.configure.SettingsScheduleSyncLcd = "false";
                          }
                          var drt = (data.reboot_time||'').split(':'),
                              ddrt = new Date();
                          if (drt) ddrt.setHours(drt[0], drt[1], 0, 0);
                          vm.configure.SettingsRebootTime = (drt ?ddrt :null);
                          var dsn = (data.schedule_on_time||'').split(':'),
                              ddsn = new Date();
                          if (dsn) ddsn.setHours(dsn[0], dsn[1], 0, 0);
                          vm.configure.SettingsScheduleOn = (dsn ?ddsn :null);
                          var dsf = (data.schedule_off_time||'').split(':'),
                              ddsf = new Date();
                          if (dsf) ddsf.setHours(dsf[0], dsf[1], 0, 0);
                          vm.configure.SettingsScheduleOff = (dsf ?ddsf :null);

                          callback();
                      },callback);
                  });
                  steps.push(function(callback) {
                      QRC.getEth0State(device.index).then(function(data) {
                          vm.configure.EthernetState = (data.data.value==='enabled' ?'enable' :'disable');
                          callback();
                      },callback);
                  });
                  steps.push(function(callback) {
                      QRC.getWifiState(device.index).then(function(data) {
                          vm.configure.WifiState = (data.data.value==='enabled' ?'enable' :'disable');
                          callback();
                      },callback);
                  });
                  steps.push(function(callback) {
                      QRC.getEth0Network(device.index).then(function(data) {
                          vm.configure.EthernetNetwork = data.data;
                          var len = data.data.network_prefix_length,
                              str = '';
                          for (var i=0; i<len; i++) str += '1';
                          for (; i<32; i++) str += '0';
                          vm.configure.EthernetNetwork.netMask = (
                              parseInt(str.substr(0, 8), 2)
                              +'.'+parseInt(str.substr(8, 8), 2)
                              +'.'+parseInt(str.substr(16, 8), 2)
                              +'.'+parseInt(str.substr(24, 8), 2)
                          );
                          callback();
                      },callback);
                  });
                  steps.push(function(callback) {
                      QRC.listAudioVolume(device.index).then(function(data) {
                          data = data.data.results;
                          vm.configure.AudioStreamMusic = data.stream_music;
                          vm.configure.AudioStreamAlarm = data.stream_alarm;
                          vm.configure.AudioStreamNotification = data.stream_notification;
                          callback();
                      },callback);
                  });
                  steps.push(function(callback) {
                      QRC.getProxy(device.index).then(function(data) {
                          data = data.data;
                          if (data.proxy_pac_url) data.type = 'pac';
                          else if (data.proxy_static_host) data.type = 'static';
                          else data.type = 'none';
                          vm.configure.SettingsProxy = data;
                          callback();
                      },callback);
                  });
                  steps.push(function(callback) {
                      QRC.getPlaylistlogState(device.index).then(function(data) {
                          data = data.data;
                          if (data.action!='' && data.action!='INTERNAL' && data.action!='NOT_STORE') {
                              data.actionUrl = data.action;
                              data.action = 'WEB';
                          }
                          vm.configure.SettingsPlaylistlogState = data;
                          callback();
                      },callback);
                  });
                  steps.push(function(callback) {
                      QRC.getEddystoneUrlSettings(device.index).then(function(data) {
                          data = data.data;
                          console.log(data);
                          if (data.state == 'enabled') {
                              beaconData.type = 'eddystone_url';
                              beaconData.action = 'enable';
                              beaconState = true;
                          }
                          beaconData.url = data.url;
                          beaconData.url_mode = data.advertise_mode;
                          beaconData.url_power = data.power;
                          callback();
                      },callback);
                  });
                  steps.push(function(callback) {
                      QRC.getEddystoneUidSettings(device.index).then(function(data) {
                          data = data.data;
                          console.log(data);
                          if (data.state == 'enabled') {
                              beaconData.type = 'eddystone_uid';
                              beaconData.action = 'enable';
                              beaconState = true;
                          }
                          beaconData.namespace = data.namespace;
                          beaconData.instance = data.instance;
                          beaconData.uid_mode = data.advertise_mode;
                          beaconData.uid_power = data.power;
                          callback();
                      },callback);
                  });
                  steps.push(function(callback) {
                      QRC.getiBeaconSettings(device.index).then(function(data) {
                          data = data.data;
                          console.log(data);
                          if (data.state == 'enabled') {
                              beaconData.type = 'ibeacon';
                              beaconData.action = 'enable';
                              beaconState = true;
                          } else if (beaconState == false) {
                              beaconData.type = 'ibeacon';
                              beaconData.action = 'disable';
                          }
                          beaconData.uuid = data.uuid;
                          beaconData.major = data.major;
                          beaconData.minor = data.minor;
                          beaconData.ibeacon_mode = data.advertise_mode;
                          beaconData.ibeacon_power = data.power;
                          vm.configure.BeaconSettings=beaconData;
                          callback();
                      },callback);
                  });
                  steps.push(function(callback) {
                      QRC.getNfcState(device.index).then(function(data) {
                          console.log('NfcState', data);
                          vm.supportNfc = true;
                          vm.configure.NfcState = (data.data.value ? 'enable' :'disable');
                          callback();
                      }, function(err) {
                          vm.supportNfc = false;
                          callback(err);
                      });
                  });
                  steps.push(function(callback) {
                      QRC.getNfcCardType(device.index).then(function(data) {
                          data = data.data.value;
                          console.log('NfcCardType', data);
                          if (data == 1) {
                              vm.configure.NfcCardType = 'low';
                          } else if (data == 2) {
                              vm.configure.NfcCardType = 'high';
                          } else {
                              vm.configure.NfcCardType = 'all';
                          }
                          callback();
                      }, callback);
                  });
                  steps.push(function(callback) {
                      QRC.getNfcReverse(device.index).then(function(data) {
                          data = data.data.value;
                          console.log('NfcReverse', data);
                          if (data == 1) {
                              vm.configure.NfcReverse = 'enable';
                          } else {
                              vm.configure.NfcReverse = 'disable';
                          }
                          callback();
                      }, callback);
                  });
                  steps.push(function(callback) {
                      QRC.getNfcUuidFormat(device.index).then(function(data) {
                          data = data.data.value;
                          console.log('NfcUuidFormat', data);
                          if (data == 1) {
                              vm.configure.NfcUuidFormat = 'dec';
                          } else {
                              vm.configure.NfcUuidFormat = 'hex';
                          }
                          callback();
                      }, callback);
                  });
                  steps.push(function(callback) {
                      QRC.getNfcUuidUpperCase(device.index).then(function(data) {
                          data = data.data.value;
                          console.log('NfcUuidUpperCase', data);
                          if (data == 1) {
                              vm.configure.NfcUuidUpperCase = 'enable';
                          } else {
                              vm.configure.NfcUuidUpperCase = 'disable';
                          }
                          callback();
                      }, callback);
                  });
                  steps.push(function(callback) {
                      QRC.getNfcByteAligned(device.index).then(function(data) {
                          data = data.data.value;
                          console.log('NfcByteAligned', data);
                          if (data == 1) {
                              vm.configure.NfcByteAligned = 'enable';
                          } else {
                              vm.configure.NfcByteAligned = 'disable';
                          }
                          callback();
                      }, callback);
                  });
                  steps.push(function(callback) {
                      QRC.getNfcStripLeading(device.index).then(function(data) {
                          data = data.data.value;
                          console.log('NfcStripLeading', data);
                          if (0 < data) {
                              vm.configure.NfcStripLeading = parseInt(data);
                          } else {
                              vm.configure.NfcStripLeading = 0;
                          }
                          callback();
                      }, callback);
                  });
                  steps.push(function(callback) {
                      QRC.getNfcStripTrailing(device.index).then(function(data) {
                          data = data.data.value;
                          console.log('NfcStripTrailing', data);
                          if (0 < data) {
                              vm.configure.NfcStripTrailing = parseInt(data);
                          } else {
                              vm.configure.NfcStripTrailing = 0;
                          }
                          callback();
                      }, callback);
                  });
                  steps.push(function(callback) {
                      QRC.getEmergencyMessage(device.index).then(function(data) {
                          data = data.data;
                          console.log(data);
                          vm.configure.TextMessage = {};
                          if(data.data) {
                              if(data.data.options) {
                                  vm.configure.TextMessage.emergency_title = data.data.options.title;
                              }
                              vm.configure.TextMessage.emergency_message = data.data.msg;
                          }

                          callback()
                      },callback);
                  });
                  steps.push(function(callback) {
                      QRC.getBroadcastMessage(device.index).then(function(data) {
                          data = data.data
                          //console.log(data);
                          if(data.data) {
                              if(data.data.dur) vm.configure.TextMessage.broadcast_duration = data.data.dur;
                              if(data.data.msg) vm.configure.TextMessage.broadcast_message = data.data.msg;
                              if(data.data.options) {
                                  //console.log(data.data.options);
                                  var options = data.data.options;
                                  if(typeof options == "String") options = JSON.parse(data.data.options);
                                  if(options.fontSize) vm.configure.TextMessage.broadcast_font = options.fontSize;
                                  if(options.fontColor) vm.configure.TextMessage.fontColor = options.fontColor;
                                  if(options.bgColor) {
                                      vm.configure.TextMessage.backgroundColorType = "broadcastBackgroundColor";
                                      vm.configure.TextMessage.backgroundColor = options.bgColor;
                                  } else {
                                      vm.configure.TextMessage.backgroundColorType="transparent";
                                  }
                                  if(options.direction) vm.configure.TextMessage.direction = options.direction;
                                  if(data.data.starttime) {
                                      vm.configure.TextMessage.startTime = "custom";
                                      var startDate = new Date(data.data.starttime);
                                      vm.configure.TextMessage.broadcast_customTime = startDate;
                                  }
                              }
                          }
                          callback()
                      },callback);
                  });
                  steps.push(function(callback) {
                      QRC.getAppList(device.index).then(function(data) {
                          data = data.data
                          if(data.results) {
                              vm.configure.AppSelect = "";
                              vm.configure.AppList = data.results;
                          }
                          callback()
                      },callback);
                  });
          }
          
          function getWindowsDeviceConfiguration(steps) {
              //TODO: get windows device configuration
              steps.push(function(callback) {
                      QRC.getSettings('', device.index).then(function(data) {
                          data = data.data.results;
                          vm.configure.Timezone = data.timezone;
                          vm.configure.SettingsPlayerName = data.player_name;
                          vm.configure.SettingsPlayGroup = data.play_group;
                          vm.configure.SettingsLogLocation = data.log_location;
                          switch(data.screen_orientation) {
                              case 0:
                              data.screen_orientation = "0";
                              break;
                              case 90:
                              data.screen_orientation = "1";
                              break;
                              case 180:
                              data.screen_orientation = "2";
                              break;
                              case 270:
                              data.screen_orientation = "3";
                              break;
                          }
                          vm.configure.SettingsScreenOrientation = data.screen_orientation;
                          callback();
                      },callback);
                  });
              
              steps.push(function(callback) {
                      QRC.getWifiState(device.index).then(function(data) {
                          vm.configure.WifiState = (data.data.value==='enabled' ?'enable' :'disable');
                          callback();
                      },callback);
                  });
              
              steps.push(function(callback) {
                      QRC.listAudioVolume(device.index).then(function(data) {
                          data = data.data.results;
                          vm.configure.AudioStreamSystem = data.stream_system;
                          callback();
                      },callback);
                  });

              steps.push(function(callback) {
                  QRC.getProxy(device.index).then(function(data) {
                      data = data.data;
                      if (data.proxy_static_host) data.type = 'static';
                      else data.type = 'none';
                      vm.configure.SettingsProxy = data;
                      callback();
                  },callback);
              });

              steps.push(function(callback) {
                  QRC.getAppList(device.index).then(function(data) {
                      data = data.data;
                      if(data.results) {
                          for(var key in data.results) {
                              data.results[key].label = data.results[key].pkgname + " " + data.results[key].PID;
                          }
                          vm.configure.AppSelect = "";
                          vm.configure.AppList = data.results;
                      }

                      callback()
                  },callback);
              });
          }
          
          if (1 === count) {
              var device = vm.scannedDevices[devIndex];
              QRC.setTargetIpAddress(device.ip, device.index);
              QRC.getToken((vm.current_password||'12345678'), device.index).then(function(data) {
                  QRC.setTargetAuthToken(data.data.access_token, device.index);
                  var steps = [],
                      nextStep = function() {
                          if (!steps.length) return;
                          steps.shift()(nextStep);
                      };
                  if(device.os_type == 'android') {
                      getAndroidDeviceConfiguration(steps);
                  } else if(device.os_type == 'windows') {
                      getWindowsDeviceConfiguration(steps);
                  }
                  /*
                  steps.push(function(callback) {
                      console.log(vm.configure)
                  });*/
                  nextStep();
              });
          }
          return status;
      }

      function MD5(string) {

         function RotateLeft(lValue, iShiftBits) {
                 return (lValue<<iShiftBits) | (lValue>>>(32-iShiftBits));
         }

         function AddUnsigned(lX,lY) {
                 var lX4,lY4,lX8,lY8,lResult;
                 lX8 = (lX & 0x80000000);
                 lY8 = (lY & 0x80000000);
                 lX4 = (lX & 0x40000000);
                 lY4 = (lY & 0x40000000);
                 lResult = (lX & 0x3FFFFFFF)+(lY & 0x3FFFFFFF);
                 if (lX4 & lY4) {
                         return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
                 }
                 if (lX4 | lY4) {
                         if (lResult & 0x40000000) {
                                 return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
                         } else {
                                 return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
                         }
                 } else {
                         return (lResult ^ lX8 ^ lY8);
                 }
         }

         function F(x,y,z) { return (x & y) | ((~x) & z); }
         function G(x,y,z) { return (x & z) | (y & (~z)); }
         function H(x,y,z) { return (x ^ y ^ z); }
         function I(x,y,z) { return (y ^ (x | (~z))); }

         function FF(a,b,c,d,x,s,ac) {
                 a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac));
                 return AddUnsigned(RotateLeft(a, s), b);
         };

         function GG(a,b,c,d,x,s,ac) {
                 a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac));
                 return AddUnsigned(RotateLeft(a, s), b);
         };

         function HH(a,b,c,d,x,s,ac) {
                 a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac));
                 return AddUnsigned(RotateLeft(a, s), b);
         };

         function II(a,b,c,d,x,s,ac) {
                 a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac));
                 return AddUnsigned(RotateLeft(a, s), b);
         };

         function ConvertToWordArray(string) {
                 var lWordCount;
                 var lMessageLength = string.length;
                 var lNumberOfWords_temp1=lMessageLength + 8;
                 var lNumberOfWords_temp2=(lNumberOfWords_temp1-(lNumberOfWords_temp1 % 64))/64;
                 var lNumberOfWords = (lNumberOfWords_temp2+1)*16;
                 var lWordArray=Array(lNumberOfWords-1);
                 var lBytePosition = 0;
                 var lByteCount = 0;
                 while ( lByteCount < lMessageLength ) {
                         lWordCount = (lByteCount-(lByteCount % 4))/4;
                         lBytePosition = (lByteCount % 4)*8;
                         lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount)<<lBytePosition));
                         lByteCount++;
                 }
                 lWordCount = (lByteCount-(lByteCount % 4))/4;
                 lBytePosition = (lByteCount % 4)*8;
                 lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80<<lBytePosition);
                 lWordArray[lNumberOfWords-2] = lMessageLength<<3;
                 lWordArray[lNumberOfWords-1] = lMessageLength>>>29;
                 return lWordArray;
         };

         function WordToHex(lValue) {
                 var WordToHexValue="",WordToHexValue_temp="",lByte,lCount;
                 for (lCount = 0;lCount<=3;lCount++) {
                         lByte = (lValue>>>(lCount*8)) & 255;
                         WordToHexValue_temp = "0" + lByte.toString(16);
                         WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length-2,2);
                 }
                 return WordToHexValue;
         };

         function Utf8Encode(string) {
                 string = string.replace(/\r\n/g,"\n");
                 var utftext = "";

                 for (var n = 0; n < string.length; n++) {

                         var c = string.charCodeAt(n);

                         if (c < 128) {
                                 utftext += String.fromCharCode(c);
                         }
                         else if((c > 127) && (c < 2048)) {
                                 utftext += String.fromCharCode((c >> 6) | 192);
                                 utftext += String.fromCharCode((c & 63) | 128);
                         }
                         else {
                                 utftext += String.fromCharCode((c >> 12) | 224);
                                 utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                                 utftext += String.fromCharCode((c & 63) | 128);
                         }

                 }

                 return utftext;
         };

         var x=Array();
         var k,AA,BB,CC,DD,a,b,c,d;
         var S11=7, S12=12, S13=17, S14=22;
         var S21=5, S22=9 , S23=14, S24=20;
         var S31=4, S32=11, S33=16, S34=23;
         var S41=6, S42=10, S43=15, S44=21;

         string = Utf8Encode(string);

         x = ConvertToWordArray(string);

         a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476;

         for (k=0;k<x.length;k+=16) {
                 AA=a; BB=b; CC=c; DD=d;
                 a=FF(a,b,c,d,x[k+0], S11,0xD76AA478);
                 d=FF(d,a,b,c,x[k+1], S12,0xE8C7B756);
                 c=FF(c,d,a,b,x[k+2], S13,0x242070DB);
                 b=FF(b,c,d,a,x[k+3], S14,0xC1BDCEEE);
                 a=FF(a,b,c,d,x[k+4], S11,0xF57C0FAF);
                 d=FF(d,a,b,c,x[k+5], S12,0x4787C62A);
                 c=FF(c,d,a,b,x[k+6], S13,0xA8304613);
                 b=FF(b,c,d,a,x[k+7], S14,0xFD469501);
                 a=FF(a,b,c,d,x[k+8], S11,0x698098D8);
                 d=FF(d,a,b,c,x[k+9], S12,0x8B44F7AF);
                 c=FF(c,d,a,b,x[k+10],S13,0xFFFF5BB1);
                 b=FF(b,c,d,a,x[k+11],S14,0x895CD7BE);
                 a=FF(a,b,c,d,x[k+12],S11,0x6B901122);
                 d=FF(d,a,b,c,x[k+13],S12,0xFD987193);
                 c=FF(c,d,a,b,x[k+14],S13,0xA679438E);
                 b=FF(b,c,d,a,x[k+15],S14,0x49B40821);
                 a=GG(a,b,c,d,x[k+1], S21,0xF61E2562);
                 d=GG(d,a,b,c,x[k+6], S22,0xC040B340);
                 c=GG(c,d,a,b,x[k+11],S23,0x265E5A51);
                 b=GG(b,c,d,a,x[k+0], S24,0xE9B6C7AA);
                 a=GG(a,b,c,d,x[k+5], S21,0xD62F105D);
                 d=GG(d,a,b,c,x[k+10],S22,0x2441453);
                 c=GG(c,d,a,b,x[k+15],S23,0xD8A1E681);
                 b=GG(b,c,d,a,x[k+4], S24,0xE7D3FBC8);
                 a=GG(a,b,c,d,x[k+9], S21,0x21E1CDE6);
                 d=GG(d,a,b,c,x[k+14],S22,0xC33707D6);
                 c=GG(c,d,a,b,x[k+3], S23,0xF4D50D87);
                 b=GG(b,c,d,a,x[k+8], S24,0x455A14ED);
                 a=GG(a,b,c,d,x[k+13],S21,0xA9E3E905);
                 d=GG(d,a,b,c,x[k+2], S22,0xFCEFA3F8);
                 c=GG(c,d,a,b,x[k+7], S23,0x676F02D9);
                 b=GG(b,c,d,a,x[k+12],S24,0x8D2A4C8A);
                 a=HH(a,b,c,d,x[k+5], S31,0xFFFA3942);
                 d=HH(d,a,b,c,x[k+8], S32,0x8771F681);
                 c=HH(c,d,a,b,x[k+11],S33,0x6D9D6122);
                 b=HH(b,c,d,a,x[k+14],S34,0xFDE5380C);
                 a=HH(a,b,c,d,x[k+1], S31,0xA4BEEA44);
                 d=HH(d,a,b,c,x[k+4], S32,0x4BDECFA9);
                 c=HH(c,d,a,b,x[k+7], S33,0xF6BB4B60);
                 b=HH(b,c,d,a,x[k+10],S34,0xBEBFBC70);
                 a=HH(a,b,c,d,x[k+13],S31,0x289B7EC6);
                 d=HH(d,a,b,c,x[k+0], S32,0xEAA127FA);
                 c=HH(c,d,a,b,x[k+3], S33,0xD4EF3085);
                 b=HH(b,c,d,a,x[k+6], S34,0x4881D05);
                 a=HH(a,b,c,d,x[k+9], S31,0xD9D4D039);
                 d=HH(d,a,b,c,x[k+12],S32,0xE6DB99E5);
                 c=HH(c,d,a,b,x[k+15],S33,0x1FA27CF8);
                 b=HH(b,c,d,a,x[k+2], S34,0xC4AC5665);
                 a=II(a,b,c,d,x[k+0], S41,0xF4292244);
                 d=II(d,a,b,c,x[k+7], S42,0x432AFF97);
                 c=II(c,d,a,b,x[k+14],S43,0xAB9423A7);
                 b=II(b,c,d,a,x[k+5], S44,0xFC93A039);
                 a=II(a,b,c,d,x[k+12],S41,0x655B59C3);
                 d=II(d,a,b,c,x[k+3], S42,0x8F0CCC92);
                 c=II(c,d,a,b,x[k+10],S43,0xFFEFF47D);
                 b=II(b,c,d,a,x[k+1], S44,0x85845DD1);
                 a=II(a,b,c,d,x[k+8], S41,0x6FA87E4F);
                 d=II(d,a,b,c,x[k+15],S42,0xFE2CE6E0);
                 c=II(c,d,a,b,x[k+6], S43,0xA3014314);
                 b=II(b,c,d,a,x[k+13],S44,0x4E0811A1);
                 a=II(a,b,c,d,x[k+4], S41,0xF7537E82);
                 d=II(d,a,b,c,x[k+11],S42,0xBD3AF235);
                 c=II(c,d,a,b,x[k+2], S43,0x2AD7D2BB);
                 b=II(b,c,d,a,x[k+9], S44,0xEB86D391);
                 a=AddUnsigned(a,AA);
                 b=AddUnsigned(b,BB);
                 c=AddUnsigned(c,CC);
                 d=AddUnsigned(d,DD);
              }

          var temp = WordToHex(a)+WordToHex(b)+WordToHex(c)+WordToHex(d);

          return temp.toLowerCase();
      }

      function runConfigureCase(caseIdx, device, isSimulate) {
          var isRemoteRequest = false;
          var configKey = configureCases[caseIdx];
          if (isGlobalConfigureBreak || device.isConfigFailed) {
              if (!isSimulate) {
                  readyForNextConfig(device, caseIdx, false);
                  if (configKey == "DoneConfig") {
                      $timeout(configOneMoreDevice, 100);
                  }
              }
              return isRemoteRequest;
          }

          if (configKey == "GetToken") {
              if (!isSimulate && vm.remote_or_export=='remote') {
                  isRemoteRequest = true;
                  QRC.setTargetIpAddress(device.ip, device.index);
                  QRC.getToken((vm.current_password||'12345678'), device.index)
                      .then(successGetTokenFn, errorConfigFn);
              } else {
                  QRC.setTargetIpAddress(device.ip, device.index);
                  readyForNextConfig(device, caseIdx, true);
              }
          } else if (configKey == "DoneConfig") {
              if (!isSimulate ) {
                  //for (var k = 0; k < 1000000000; k++) {var c = 0;}
                  if(vm.remote_or_export=='remote') {
                      printAndAppendConfigureResult("Done Config device " +
                            deviceToString(device));
                  } else {
                      //Finish log the export config
                      var zip = new JSZip();
                      var outJson =
                          {
                              configure: JSON.parse(JSON.stringify(vm.configure)),
                              useConfig: JSON.parse(JSON.stringify(vm.useConfig)),
                              exportConfig: JSON.parse(JSON.stringify(vm.exportConfig))
                          };
                      //check export encrypt password
                      if(vm.ExportEncryptPassword == true) {
                          if(outJson.useConfig.SecurityPasswordEnabled && outJson.useConfig.SecurityPassword) {
                              var password = outJson.configure.SecurityPassword;
                              delete outJson.configure.SecurityPassword;
                              for (var key in outJson.exportConfig) {
                                  if (outJson.exportConfig.hasOwnProperty(key)) {
                                      if(outJson.exportConfig[key].key == "SecurityPassword") {
                                          outJson.exportConfig[key].key = "EncryptPassword";
                                          outJson.exportConfig[key].url = "http://localhost:8080/v1/user/encrypt_password";
                                          outJson.exportConfig[key].param = {
                                              "value": MD5(outJson.exportConfig[key].param.value)
                                          }
                                          break;
                                      }
                                  }
                              }
                          }
                      }
                      //replace 
                      zip.file("UsbConfigure.json", JSON.stringify(outJson));
                      $.when(
                          $.get("usbconf.html", function(result){
                              zip.file("usbconf.html", result);
                          }),
                          $.get("bower_components/jquery/dist/jquery.min.js", function(result){
                              zip.file("jquery.min.js", result);
                          }),
                          $.get("bower_components/angular/angular.min.js", function(result){
                              zip.file("angular.min.js", result);
                          })
                      ).then(function() {
                          var content = zip.generate({type:"blob"});
                          saveAs(content, "usbconf.zip");}
                          , function() {
                              var a = document.createElement('a');
                              a.href = 'data:attachment/json,' + JSON.stringify(outJson);
                              a.target      = '_blank';
                              a.download    = 'UsbConfigure.json';
                              a.click();}
                      );
                  }

                  device.isConfigComplete = true;
                  if (device.isConfigFailed) {
                      consoel.error("What?!");
                  }
                  readyForNextConfig(device, caseIdx, true);
                  $timeout(configOneMoreDevice, 100);
              }
          } else if (vm.useConfig[configKey]) {
              if(vm.remote_or_export=='remote') {
                  isRemoteRequest = true;
              }
              if (!isSimulate) {
                  runConfigureByKey(configKey, caseIdx, device, isSimulate);
              }
          } else {
              if (!isSimulate) {
                  // configKey doesn't exist, skip.
                  readyForNextConfig(device, caseIdx, true);
              }
          }
          return isRemoteRequest;


          function netMaskToPrefixLength(mask) {
              var maskNodes = mask.match(/(\d+)/g);
              var cidr = 0;
              for(var i in maskNodes)
              {
                  cidr += (((maskNodes[i] >>> 0).toString(2)).match(/1/g) || []).length;
              }
              return cidr;
          }


          function runConfigureByKey(configKey, caseIdx, device) {
              // fix closure issue
              vm.configure = window.rccConfigure;
              
              var retryWifi = 0;
              var MAX_RETRY = 20;
              var RETRY_DELAY = 1000; //we give it 20 (20 * 1000ms) sec to retry wifi network setup
              if (configKey == "SettingsPlayerName") {
                  if (vm.remote_or_export=='remote') {
                      QRC.setSettings("player_name",
                      vm.configure[configKey], device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/player_name", device.index);
                      var param = {"value": vm.configure[configKey]};
                      vm.exportConfig[caseIdx] = {key:configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              }
              else if (configKey == "SettingsPlayGroup") {
                  if (vm.remote_or_export=='remote') {
                      QRC.setSettings("play_group",
                      vm.configure[configKey], device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/play_group", device.index);
                      var param = {"value": vm.configure[configKey]};
                      vm.exportConfig[caseIdx] = {key:configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              }
              else if (configKey == "SettingsNtpServer") {
                  if(vm.remote_or_export=='remote') {
                      QRC.setSettings("ntp_server",
                      vm.configure[configKey], device.index)
                      .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/ntp_server", device.index);
                      var param = {"value": vm.configure[configKey]};
                      vm.exportConfig[caseIdx] = {key:configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SettingsSmilContentUrl") {
                  if(vm.remote_or_export=='remote') {
                      QRC.setSettings("smil_content_url",
                                      vm.configure[configKey], device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/smil_content_url", device.index);
                      var param = {"value": vm.configure[configKey]};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SettingsRebootMode") {
                  var mode = vm.configure.SettingsRebootMode;
                  if ("DailyReboot"==mode) {
                      vm.useConfig.SettingsRebootTime = true;
                      delete vm.useConfig.SettingsScheduleOn;
                      delete vm.useConfig.SettingsScheduleOff;
                      delete vm.useConfig.SettingsScheduleOffDays;
                      delete vm.useConfig.SettingsScheduleSyncLcd;
                  }
                  else {
                      delete vm.useConfig.SettingsRebootTime;
                      vm.useConfig.SettingsScheduleOn = true;
                      vm.useConfig.SettingsScheduleOff = true;
                      //vm.useConfig.SettingsScheduleOffDays = true;
                      //vm.useConfig.SettingsScheduleSyncLcd = true;
                  }
                  if (vm.remote_or_export=='remote') {
                      QRC.setSettings("schedule_reboot_mode",
                          vm.configure[configKey], device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/schedule_reboot_mode", device.index);
                      var param = {"value": vm.configure[configKey]};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SettingsScheduleOn") {
                  var timeObj = vm.configure[configKey];
                  if (!timeObj) {
                      readyForNextConfig(device, caseIdx, true);
                      return false;
                  }
                  var timeStr = (("0"+timeObj.getHours()).slice(-2)+":"+("0"+timeObj.getMinutes()).slice(-2));
                  if (vm.remote_or_export=='remote') {
                      QRC.setSettings("schedule_on_time", timeStr, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/schedule_on_time", device.index);
                      var param = {"value": timeStr};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SettingsScheduleOff") {
                  var timeObj = vm.configure[configKey];
                  if (!timeObj) {
                      readyForNextConfig(device, caseIdx, true);
                      return false;
                  }
                  var timeStr = (("0"+timeObj.getHours()).slice(-2)+":"+("0"+timeObj.getMinutes()).slice(-2));
                  if (vm.remote_or_export=='remote') {
                      QRC.setSettings("schedule_off_time", timeStr, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/schedule_off_time", device.index);
                      var param = {"value": timeStr};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              }  else if (configKey == "SettingsScheduleOffDays") {
                  var offDaysObj = vm.configure[configKey];
                  if (!offDaysObj) {
                      readyForNextConfig(device, caseIdx, true);
                      return false;
                  }
                  if (vm.remote_or_export=='remote') {
                      QRC.setSettings("schedule_off_days", offDaysObj, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/schedule_off_days", device.index);
                      var param = {"value": offDaysObj};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              }  else if (configKey == "SettingsScheduleSyncLcd") {
                  var syncLcd = vm.configure[configKey];
                  if(syncLcd == "true") {
                      syncLcd = true;
                  } else {
                      syncLcd = false;
                  }
                  if (vm.remote_or_export=='remote') {
                      QRC.setSettings("schedule_led_off", syncLcd, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/schedule_led_off", device.index);
                      var param = {"value": syncLcd};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SettingsRebootTime") {
                  var timeObj = vm.configure[configKey];
                  if (!timeObj) {
                      readyForNextConfig(device, caseIdx, true);
                      return false;
                  }
                  var timeStr = (("0"+timeObj.getHours()).slice(-2)+":"+("0"+timeObj.getMinutes()).slice(-2));
                  if(vm.remote_or_export=='remote') {
                      QRC.setSettings("reboot_time", timeStr, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/reboot_time", device.index);
                      var param = {"value": timeStr};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SettingsAutoTime") {
                  var autoTime;
                  if (vm.configure.SettingsAutoTime == "enable") {
                      autoTime = true;
                  } else {
                      autoTime = false;
                  }
console.log('autoTime', autoTime)
                  if(vm.remote_or_export=='remote') {
                      QRC.setSettings("auto_time_enabled", autoTime, device.index)
                      .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/auto_time_enabled", device.index);
                      var param = {"value": autoTime};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SettingsTimeFormat") {
                  var time24Format;
                  if (vm.configure.SettingsTimeFormat == "enable") {
                      time24Format = "enabled";
                  } else {
                      time24Format = "disabled";
                  }
                  if (vm.remote_or_export=='remote') {
                      QRC.setSettings("24_time_format", time24Format, device.index)
                      .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/24_time_format", device.index);
                      var param = {"value": time24Format};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SettingsRebootTimeOptimized") {
                  var rebootOpt;
                  if (vm.configure.SettingsRebootTimeOptimized == "enable") {
                      rebootOpt = true;
                  } else {
                      rebootOpt = false;
                  }
                  if(vm.remote_or_export=='remote') {
                      QRC.setSettings("is_reboot_optimized", rebootOpt, device.index)
                      .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/is_reboot_optimized", device.index);
                      var param = {"value": rebootOpt};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SettingsScreenOrientation") {
                  if(vm.remote_or_export=='remote') {
                      QRC.setSettings("screen_orientation", vm.configure.SettingsScreenOrientation, device.index)
                      .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/screen_orientation", device.index);
                      var param = {"value": vm.configure.SettingsScreenOrientation};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SettingsOtaXmlUrl") {
                  if(vm.remote_or_export=='remote') {
                      QRC.setSettings("ota_xml_url",
                                      vm.configure[configKey], device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/ota_xml_url", device.index);
                      var param = {"value": vm.configure[configKey]};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SettingsAppOtaXmlUrl") {
                  if(vm.remote_or_export=='remote') {
                      QRC.setSettings("app_ota_xml_url",
                                      vm.configure[configKey], device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/app_ota_xml_url", device.index);
                      var param = {"value": vm.configure[configKey]};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SettingsAdbOverTcp") {
                  var port;
                  if (vm.configure.SettingsAdbOverTcp == "enable") {
                      port = 5555;
                  } else {
                      port = -1;
                  }
                  if(vm.remote_or_export=='remote') {
                      QRC.setProp("persist.adb.tcp.port", port, device.index)
                      .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/prop/persist.adb.tcp.port", device.index);
                      var param = {"value": port};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
                  vm.useConfig.TmpDisableAdb = true;
                  vm.useConfig.SettingsAdbEnabled = true;
              } else if (configKey == "TmpDisableAdb") {
                  delete vm.useConfig["TmpDisableAdb"];
                  if(vm.remote_or_export=='remote') {
                      QRC.setSettings("adb_enabled", false, device.index)
                      .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/adb_enabled", device.index);
                      var param = {"value": false};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SettingsAdbEnabled") {
                  var enable;
                  if (vm.configure.SettingsAdbEnabled == "enable") {
                      enable = true;
                  } else {
                      enable = false;
                  }
                  if(vm.remote_or_export=='remote') {
                       QRC.setSettings("adb_enabled", enable, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/adb_enabled", device.index);
                      var param = {"value": enable};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SecurityPasswordEnabled") {
                  if (vm.configure.SecurityPasswordEnabled == "enable") {
                      vm.useConfig["SecurityPassword"] = true;
                      readyForNextConfig(device, caseIdx, true);
                      return;
                  } else {
                      if(vm.remote_or_export=='remote') {
                          QRC.deleteSecurityPassword(device.index)
                          .then(successConfigFn, errorConfigFn);
                      } else {
                          var url = QRC.buildUrl("/v1/user/password", device.index);
                          vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "delete":true};
                          readyForNextConfig(device, caseIdx, true);
                      }
                  }
              } else if (configKey == "SecurityPassword") {
                  if(vm.remote_or_export=='remote') {
                      QRC.setSecurityPassword(
                      vm.configure[configKey], device.index)
                      .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/user/password", device.index);
                      var param = {"value": vm.configure[configKey]};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "Timezone") {
                  if (!vm.configure[configKey]) {
                      readyForNextConfig(device, caseIdx, true);
                      return;
                  }
                  if(vm.remote_or_export=='remote') {
                      QRC.setSettings("timezone", vm.configure[configKey], device.index)
                      .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/timezone", device.index);
                      var param = {"value": vm.configure[configKey]};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }

              } else if (configKey == "AudioStreamMusic") {
                  if (vm.configure[configKey] == -1 || isNaN(vm.configure[configKey])) {
                      readyForNextConfig(device, caseIdx, true);
                      return;
                  }
                  if(vm.remote_or_export=='remote') {
                      QRC.setAudioVolume(
                      "stream_music", vm.configure[configKey], device.index)
                      .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/audio/volume/stream_music", device.index);
                      var param = {"value": vm.configure[configKey]};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "AudioStreamNotification") {
                  if (vm.configure[configKey] == -1 || isNaN(vm.configure[configKey])) {
                      readyForNextConfig(device, caseIdx, true);
                      return;
                  }
                  if(vm.remote_or_export=='remote') {
                      QRC.setAudioVolume(
                      "stream_notification", vm.configure[configKey], device.index)
                      .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/audio/volume/stream_notification", device.index);
                      var param = {"value": vm.configure[configKey]};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "AudioStreamAlarm") {
                  if (vm.configure[configKey] == -1 || isNaN(vm.configure[configKey])) {
                      readyForNextConfig(device, caseIdx, true);
                      return;
                  }
                  if(vm.remote_or_export=='remote') {
                      QRC.setAudioVolume(
                      "stream_alarm", vm.configure[configKey], device.index)
                      .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/audio/volume/stream_alarm", device.index);
                      var param = {"value": vm.configure[configKey]};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "AudioStreamSystem") {
                  if (vm.configure[configKey] == -1 || isNaN(vm.configure[configKey])) {
                      readyForNextConfig(device, caseIdx, true);
                      return;
                  }
                  if(vm.remote_or_export=='remote') {
                      QRC.setAudioVolume(
                      "stream_system", vm.configure[configKey], device.index)
                      .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/audio/volume/stream_system", device.index);
                      var param = {"value": vm.configure[configKey]};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "EthernetState") {
                  var state;
                  if (vm.configure.EthernetState == "enable") {
                      state = 1;
                  } else {
                      state = 0;
                  }
                  if(vm.remote_or_export=='remote') {
                      QRC.setEth0State(state, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var stateStr = (state != 0)? "enabled" : "disabled";
                      var url = QRC.buildUrl("/v1/eth/0/state", device.index);
                      var param = {"value": stateStr};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "EthernetNetwork") {
                  if (vm.configure.EthernetNetwork.hasOwnProperty("ip_assignment")) {
                      if (vm.configure.EthernetNetwork.ip_assignment == "dhcp") {
                          var ethConfig = {ip_assignment: "dhcp"};
                          if(vm.remote_or_export=='remote') {
                              QRC.setEth0Network(ethConfig, device.index)
                              .then(successConfigFn, errorConfigFn);
                          } else {
                              var url = QRC.buildUrl("/v1/eth/0/network", device.index);
                              vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":ethConfig};
                              readyForNextConfig(device, caseIdx, true);
                          }
                      } else if (vm.configure.EthernetNetwork.ip_assignment == "static") {
                          vm.configure.EthernetNetwork.network_prefix_length =
                              netMaskToPrefixLength(vm.configure.EthernetNetwork.netMask);
                          if(vm.remote_or_export=='remote') {
                              QRC.setEth0Network(vm.configure.EthernetNetwork, device.index)
                              .then(successConfigFn, errorConfigFn);
                          } else {
                              var url = QRC.buildUrl("/v1/eth/0/network", device.index);
                              vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":vm.configure.EthernetNetwork};
                              readyForNextConfig(device, caseIdx, true);
                          }
                      }
                  } else {
                      readyForNextConfig(device, caseIdx, true);
                      return;
                  }
              } else if (configKey == "WifiState") {
                  var wifistate;
                  if (vm.configure.WifiState == "enable") {
                      wifistate = 1;
                  } else {
                      wifistate = 0;
                  }
                  if(vm.remote_or_export=='remote') {
                      if(vm.config_device_os=='android') {
                          QRC.setWifiState(wifistate, device.index)
                              .then(successConfigFn, errorConfigFn);
                      } else {
                          QRC.setNetWifiState(wifistate, device.index)
                              .then(successConfigFn, errorConfigFn);
                      }
                  } else {
                      var stateStr = (state != 0)? "enabled" : "disabled";
                      var url = QRC.buildUrl("/v1/wifi/state", device.index);
                      var param = {"value": stateStr};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "WifiNetwork") {
                  if(vm.remote_or_export=='remote') {
                      if(vm.config_device_os=='android') {
                          // Make sure wifi is enabled before config it,
                          // otherwise configuration will not take effect.
                          QRC.getWifiState(device.index).then(success1stWifiFn, errorConfigFn);
                      } else {
                          // for windows
                          vm.configure.WifiNetwork.method = "connect";
                          QRC.setNetWifiNetwork(vm.configure.WifiNetwork, device.index)
                              .then(successConfigFn, errorConfigFn);
                      }
                  } else {
                      if (vm.configure.WifiNetwork.hasOwnProperty("advanced")) {
                          if (vm.configure.WifiNetwork.advanced.hasOwnProperty("ip_assignment") &&
                              vm.configure.WifiNetwork.advanced.ip_assignment == "static") {
                              vm.configure.WifiNetwork.advanced.network_prefix_length =
                                  netMaskToPrefixLength(vm.configure.WifiNetwork.advanced.netMask);
                          }
                          // TODO: Set proxy
                          var url = QRC.buildUrl("/v1/wifi/network", device.index);
                          var param = vm.configure.WifiNetwork;
                          vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                          readyForNextConfig(device, caseIdx, true);
                      }
                  }
              } else if (configKey == "SettingsProxy") {
                  var data = vm.configure.SettingsProxy;
                  var proxySetting = {
                      proxy_settings: data.type
                  };
                  switch (proxySetting.proxy_settings) {
                      case 'static':
                          proxySetting.proxy_static_host = data.proxy_static_host;
                          proxySetting.proxy_static_port = data.proxy_static_port;
                          proxySetting.proxy_static_exclusion_list = (data.proxy_static_exclusion_list||'');
                          break;
                      case 'pac':
                          proxySetting.proxy_pac_url = data.proxy_pac_url;
                          break;
                  }
                  if(vm.remote_or_export=='remote') {
                      console.log(proxySetting);
                      console.log(data);
                      QRC.setProxy(proxySetting, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/net/proxy", device.index);
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":proxySetting};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SettingsPlaylistlogState") {
                  var data = vm.configure.SettingsPlaylistlogState;
                  var playlistlogSetting = {
                      action: data.action,
                      refreshInterval: data.refreshInterval,
                      retryInterval: data.retryInterval
                  }
                  if (playlistlogSetting.action == 'INTERNAL' || playlistlogSetting.action == 'WEB') {
                      if (vm.configure.SettingsPlaylistlogState.refreshInterval != '' && vm.configure.SettingsPlaylistlogState.refreshInterval>0 ) {
                          playlistlogSetting.refreshInterval = vm.configure.SettingsPlaylistlogState.refreshInterval;
                      }
                      if (playlistlogSetting.action == 'WEB') {
                          playlistlogSetting.action = vm.configure.SettingsPlaylistlogState.actionUrl;
                          if (vm.configure.SettingsPlaylistlogState.retryInterval != '' && vm.configure.SettingsPlaylistlogState.retryInterval>0 ) {
                              playlistlogSetting.retryInterval = vm.configure.SettingsPlaylistlogState.retryInterval;
                          }
                      }
                  }
                  if(vm.remote_or_export=='remote') {
                      //console.log(playlistlogSetting);
                      console.log(data);
                      QRC.setPlaylistlogState(playlistlogSetting, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/player/playlistlog/state", device.index);
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":playlistlogSetting};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "BeaconSettings") {
                  var beaconSettings = {
                      type: vm.configure.BeaconSettings.type,
                      action: vm.configure.BeaconSettings.action,
                      uuid: vm.configure.BeaconSettings.uuid,
                      major: vm.configure.BeaconSettings.major,
                      minor: vm.configure.BeaconSettings.minor,
                      ibeacon_mode: vm.configure.BeaconSettings.ibeacon_mode,
                      ibeacon_power: vm.configure.BeaconSettings.ibeacon_power,
                      namespace: vm.configure.BeaconSettings.namespace,
                      instance: vm.configure.BeaconSettings.instance,
                      uid_mode: vm.configure.BeaconSettings.uid_mode,
                      uid_power: vm.configure.BeaconSettings.uid_power,
                      url: vm.configure.BeaconSettings.url,
                      url_mode: vm.configure.BeaconSettings.url_mode,
                      url_power: vm.configure.BeaconSettings.url_power
                  }
                  console.log('data', beaconSettings)
                  if(vm.remote_or_export=='remote') {
                      QRC.setBeaconSettings(beaconSettings, device.index)
                          .then(successConfigFn, errorConfigFn);
                  }
              } else if (configKey == "NfcState") {
                  var nfcState;
                  if (vm.configure.NfcState == "enable") {
                      nfcState = true;
                  } else {
                      nfcState = false;
                  }
                  if(vm.remote_or_export=='remote') {
                      QRC.setNfcState(nfcState, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/nfc_enabled", device.index);
                      var param = {"value": nfcState};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == 'NfcCardType') {
                  var nfcCardType = 0;
                  if (vm.configure.NfcCardType == 'low') {
                    nfcCardType = 1;
                  } else if (vm.configure.NfcCardType == 'high') {
                    nfcCardType = 2;
                  }
                  if (vm.remote_or_export == 'remote') {
                      QRC.setNfcCardType(nfcCardType, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/prop/persist.sys.smatfid_freq", device.index);
                      var param = { value: nfcCardType };
                      vm.exportConfig[caseIdx] = { key: configKey, url: url, param: param };
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == 'NfcReverse') {
                  var nfcReverse = 0;
                  if (vm.configure.NfcReverse == 'enable') {
                      nfcReverse = 1;
                  }
                  if (vm.remote_or_export == 'remote') {
                      QRC.setNfcReverse(nfcReverse, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/prop/persist.sys.smartfid_reverse", device.index);
                      var param = { value: nfcReverse };
                      vm.exportConfig[caseIdx] = { key: configKey, url: url, param: param };
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == 'NfcUuidFormat') {
                  var nfcUuidFormat = 0;
                  if (vm.configure.NfcUuidFormat == 'dec') {
                      nfcUuidFormat = 1;
                  }
                  if (vm.remote_or_export == 'remote') {
                      QRC.setNfcUuidFormat(nfcUuidFormat, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/prop/persist.sys.smatfid_format", device.index);
                      var param = { value: nfcUuidFormat };
                      vm.exportConfig[caseIdx] = { key: configKey, url: url, param: param };
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == 'NfcUuidUpperCase') {
                  var nfcUuidUpperCase = 0;
                  if (vm.configure.NfcUuidUpperCase == 'enable') {
                      nfcUuidUpperCase = 1;
                  }
                  if (vm.remote_or_export == 'remote') {
                      QRC.setNfcUuidUpperCase(nfcUuidUpperCase, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/prop/persist.sys.nfc_uppercase", device.index);
                      var param = { value: nfcUuidUpperCase };
                      vm.exportConfig[caseIdx] = { key: configKey, url: url, param: param };
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == 'NfcByteAligned') {
                  var nfcByteAligned = 0;
                  if (vm.configure.NfcByteAligned == 'enable') {
                      nfcByteAligned = 1;
                  }
                  if (vm.remote_or_export == 'remote') {
                      QRC.setNfcByteAligned(nfcByteAligned, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/prop/persist.sys.nfc_bytealigned", device.index);
                      var param = { value: nfcByteAligned };
                      vm.exportConfig[caseIdx] = { key: configKey, url: url, param: param };
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == 'NfcStripLeading') {
                  var nfcStripLeading = 0;
                  if (0 < vm.configure.NfcStripLeading) {
                      nfcStripLeading = vm.configure.NfcStripLeading;
                  }
                  if (vm.remote_or_export == 'remote') {
                      QRC.setNfcStripLeading(nfcStripLeading, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/prop/persist.sys.strip_leading", device.index);
                      var param = { value: nfcStripLeading };
                      vm.exportConfig[caseIdx] = { key: configKey, url: url, param: param };
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == 'NfcStripTrailing') {
                  var nfcStripTrailing = 0;
                  if (0 < vm.configure.NfcStripTrailing) {
                      nfcStripTrailing = vm.configure.NfcStripTrailing;
                  }
                  if (vm.remote_or_export == 'remote') {
                      QRC.setNfcStripTrailing(nfcStripTrailing, device.index)
                          .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/prop/persist.sys.strip_trailing", device.index);
                      var param = { value: nfcStripTrailing };
                      vm.exportConfig[caseIdx] = { key: configKey, url: url, param: param };
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "TextMessage") { 
                  if(vm.configure.TextMessage.type == "none") {
                      QRC.setTextMessageNone(device.index)
                         .then(successConfigFn, errorConfigFn);
                  } else if(vm.configure.TextMessage.type == "emergency") {
                      QRC.setEmergenMessage(vm.configure.TextMessage, device.index)
                         .then(successConfigFn, errorConfigFn);
                      //var isoDate = new Date().toISOString();
                      //console.log(isoDate);
                  } else if(vm.configure.TextMessage.type == "broadcast") {
                      QRC.setBroadcastMessage(vm.configure.TextMessage, device.index)
                         .then(successConfigFn, errorConfigFn);
                  }
              } else if (configKey == "FirmwareUpdate") {
                  var token = QRC.getTokenVal(device.index),
                      xhr = new XMLHttpRequest(),
                      data = new FormData(),
                      $preg = $('<span>'),
                      $msg = $('<div>')
                          .attr('id', 'progress')
                          .hide()
                          .append($('<div>')
                              .addClass('box')
                              .append($('<span>').html('Firmware Upload: '))
                              .append($preg)
                          );
                  data.append('file', vm.firmwareFile);
                  xhr.open('POST', ('http://'+device.ip+':8080/v1/task/update_firmware'), true);
                  //xhr.setRequestHeader('Content-Type', 'multipart/form-data');
                  xhr.setRequestHeader('Authorization', ('Bearer '+token));
                  xhr.upload.onprogress = function(e) {
                      $preg.html(parseInt(100*e.loaded/e.total)+'%');
                  };
                  xhr.onreadystatechange = function(e) {
                      if (this.readyState != 4) return;
                      var fin = function() {
                          $msg.fadeOut(function() {
                              $(this).remove();
                          });
                      };
                      if (this.status == 200) {
                          successConfigFn(this.response);
                          fin();
                      }
                      else {
                          errorConfigFn(this.response);
                          var data = '';
                          try {
                              data = ((JSON.parse(this.response)||{}).detail||'Unknow Error');
                          }
                          catch (e) {}
                          $msg
                              .on('click', fin)
                              .find('.box').html('Firmware Update Failed: '+data);
                      }
                  };
                  $('body').append($msg.fadeIn());
                  xhr.send(data);
              } else if (configKey == "AppUpdate") {
                  var token = QRC.getTokenVal(device.index),
                      xhr = new XMLHttpRequest(),
                      data = new FormData(),
                      $preg = $('<span>'),
                      $msg = $('<div>')
                          .attr('id', 'progress')
                          .hide()
                          .append($('<div>')
                              .addClass('box')
                              .append($('<span>').html('App Upload: '))
                              .append($preg)
                          );
                  for(var i = 0; i < vm.appFiles.length; i++) {
                      data.append("file" + (i + 1), vm.appFiles[i]);
                  }
                  xhr.open('POST', ('http://'+device.ip+':8080/v1/task/update_app'), true);
                  //xhr.setRequestHeader('Content-Type', 'multipart/form-data');
                  xhr.setRequestHeader('Authorization', ('Bearer '+token));
                  xhr.upload.onprogress = function(e) {
                      $preg.html(parseInt(100*e.loaded/e.total)+'%');
                  };
                  xhr.onreadystatechange = function(e) {
                      if (this.readyState != 4) return;
                      var fin = function() {
                          $msg.fadeOut(function() {
                              $(this).remove();
                          });
                      };
                      if (this.status == 200) {
                          var response = this.response
                          QRC.getAppList(device.index).then(function(ret) {
                              ret = ret.data;
                              if(ret.results) {
                                  vm.configure.AppSelect = "";
                                  vm.configure.AppList = ret.results;
                              }
                              successConfigFn(response);
                              fin();
                          });
                      }
                      else {
                          errorConfigFn(this.response);
                          var data = '';
                          try {
                              data = ((JSON.parse(this.response)||{}).detail||'Unknow Error');
                          }
                          catch (e) {}
                          $msg
                              .on('click', fin)
                              .find('.box').html('App Update Failed: '+data);
                      }
                  };
                  $('body').append($msg.fadeIn());
                  xhr.send(data);
              } else if (configKey == "BootAnimationUpdate") {
                  var token = QRC.getTokenVal(device.index),
                      xhr = new XMLHttpRequest(),
                      data = new FormData(),
                      $preg = $('<span>'),
                      $msg = $('<div>')
                          .attr('id', 'progress')
                          .hide()
                          .append($('<div>')
                              .addClass('box')
                              .append($('<span>').html('Boot Animation Upload: '))
                              .append($preg)
                          );
                  for(var i = 0; i < vm.bootAnmicationFiles.length; i++) {
                      data.append("file" + (i + 1), vm.bootAnmicationFiles[i]);
                  }
                  xhr.open('POST', ('http://'+device.ip+':8080/v1/task/update_boot_animation'), true);
                  //xhr.setRequestHeader('Content-Type', 'multipart/form-data');
                  xhr.setRequestHeader('Authorization', ('Bearer '+token));
                  xhr.upload.onprogress = function(e) {
                      $preg.html(parseInt(100*e.loaded/e.total)+'%');
                  };
                  xhr.onreadystatechange = function(e) {
                      if (this.readyState != 4) return;
                      var fin = function() {
                          $msg.fadeOut(function() {
                              $(this).remove();
                          });
                      };
                      if (this.status == 200) {
                          successConfigFn(this.response);
                          fin();
                      }
                      else {
                          errorConfigFn(this.response);
                          var data = '';
                          try {
                              data = ((JSON.parse(this.response)||{}).detail||'Unknow Error');
                          }
                          catch (e) {}
                          $msg
                              .on('click', fin)
                              .find('.box').html('Boot Animation Failed: '+data);
                      }
                  };
                  $('body').append($msg.fadeIn());
                  xhr.send(data);
              } else if (configKey == "AppUninstall") {
                  QRC.setAppUninstall(vm.configure.AppUninstall, device.index)
                         .then(function(data) {
                          QRC.getAppList(device.index).then(function(ret) {
                              ret = ret.data;
                              if(ret.results) {
                                  vm.configure.AppSelect = "";
                                  vm.configure.AppList = ret.results;
                              }
                              successConfigFn(data);
                          });
                  }, errorConfigFn);
              } else if (configKey == "AppStart") {
                  QRC.setAppStart(vm.configure.AppStart, device.index)
                         .then(successConfigFn, errorConfigFn);
              } else if (configKey == "AppStop") {
                  QRC.setAppStop(vm.configure.AppStop, device.index)
                         .then(successConfigFn, errorConfigFn);
              } else if (configKey == "RemoteUploadFiles") {
                  var token = QRC.getTokenVal(device.index),
                      xhr = new XMLHttpRequest(),
                      data = new FormData(),
                      $preg = $('<span>'),
                      $msg = $('<div>')
                          .attr('id', 'progress')
                          .hide()
                          .append($('<div>')
                              .addClass('box')
                              .append($('<span>').html('Remote Upload Files: '))
                              .append($preg)
                          );
                  for(var i = 0; i < vm.remoteUploadFiles.length; i++) {
                      data.append("file" + (i + 1), vm.remoteUploadFiles[i]);
                  }
                  xhr.open('POST', ('http://'+device.ip+':8080/v1/task/remote_upload_file'), true);
                  //xhr.setRequestHeader('Content-Type', 'multipart/form-data');
                  xhr.setRequestHeader('Authorization', ('Bearer '+token));
                  xhr.upload.onprogress = function(e) {
                      $preg.html(parseInt(100*e.loaded/e.total)+'%');
                  };
                  xhr.onreadystatechange = function(e) {
                      if (this.readyState != 4) return;
                      var fin = function() {
                          $msg.fadeOut(function() {
                              $(this).remove();
                          });
                      };
                      if (this.status == 200) {
                          successConfigFn(this.response);
                          fin();
                      }
                      else {
                          errorConfigFn(this.response);
                          var data = '';
                          try {
                              data = ((JSON.parse(this.response)||{}).detail||'Unknow Error');
                          }
                          catch (e) {}
                          $msg
                              .on('click', fin)
                              .find('.box').html('Remote Upload Files Failed: '+data);
                      }
                  };
                  $('body').append($msg.fadeIn());
                  xhr.send(data);
              } else if (configKey == "SettingsLogLocation") { 
                  if(vm.remote_or_export=='remote') {
                      QRC.setSettings("log_location", vm.configure.SettingsLogLocation, device.index)
                      .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/log_location", device.index);
                      var param = {"value": vm.configure.SettingsLogLocation};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else if (configKey == "SettingsLocale") {
                  if(vm.remote_or_export=='remote') {
                      QRC.setSettings("locale", vm.configure.SettingsLocale.locale, device.index)
                      .then(successConfigFn, errorConfigFn);
                  } else {
                      var url = QRC.buildUrl("/v1/settings/locale", device.index);
                      var param = {"value": vm.configure.SettingsLocale.locale};
                      vm.exportConfig[caseIdx] = {"key":configKey, "url":url, "param":param};
                      readyForNextConfig(device, caseIdx, true);
                  }
              } else {
                  printConfigureError("Un-recognized configKey:" + configKey);
                  readyForNextConfig(device, caseIdx, false);
              }
              function success1stWifiFn(data) {
                  if (data.data.value == "enabled") {
                      realConfigWifiNetwork();
                  } else {
                      QRC.setWifiState(1, device.index);
                      retryWifi++;
                      $timeout(tryConfigWifiNetwork, RETRY_DELAY);
                  }
              }
              function tryConfigWifiNetwork() {
                  QRC.getWifiState(device.index).then(successWifiFn, errorConfigFn);
                  function successWifiFn(data) {
                      if (data.data.value == "enabled") {
                          realConfigWifiNetwork();
                      } else if (retryWifi >= MAX_RETRY) {
                          printConfigureError("When configuring " + configureCases[caseIdx] +
                                              ", device " + deviceToString(device) +
                                              " Unable to enable Wifi");
                          readyForNextConfig(device, caseIdx, false);
                      } else {
                          retryWifi++;
                          $timeout(tryConfigWifiNetwork, RETRY_DELAY);
                      }
                  }
              }
          }

          function realConfigWifiNetwork() {
              vm.configure.WifiNetwork.method = "connect";
              if (vm.configure.WifiNetwork.hasOwnProperty("advanced")) {
                  if (vm.configure.WifiNetwork.advanced.hasOwnProperty("ip_assignment") &&
                      vm.configure.WifiNetwork.advanced.ip_assignment == "static") {
                      vm.configure.WifiNetwork.advanced.network_prefix_length =
                          netMaskToPrefixLength(vm.configure.WifiNetwork.advanced.netMask);
                  }
                  // TODO: Set proxy
              }
              QRC.setWifiNetwork(vm.configure.WifiNetwork, device.index)
                  .then(successConfigFn, errorConfigFn);
          }
          function successGetTokenFn(data) {
              QRC.setTargetAuthToken(data.data.access_token, device.index);
              readyForNextConfig(device, caseIdx, true);
          }
          function successConfigFn(data) {
              readyForNextConfig(device, caseIdx, true);
          }
          function errorConfigFn(data) {
              printConfigureError("When configuring " + configureCases[caseIdx] + ", device " + deviceToString(device) + " Response error:",
                                  data);
              readyForNextConfig(device, caseIdx, false);
          }
      }

      function readyForNextConfig(device, caseIdx, isSuccess) {
          configuringDoneNum++;
          if (!isSuccess) {
              device.isConfigFailed = true;
          }
          //console.log("configuringDoneNum:" + configuringDoneNum);
          if ((caseIdx+1) < configureCases.length) {
              var isRemoteRequest = runConfigureCase(caseIdx+1, device, true);
              var timeDelay = isRemoteRequest? 150:0;
              $timeout(runConfigureCase, timeDelay, true, caseIdx+1, device);
          }


          if (configuringDoneNum == totalConfigureNum ||
              (isGlobalConfigureBreak && !isGlobalConfigureBreakDone)) {
              if (isGlobalConfigureBreak) {
                  isGlobalConfigureBreakDone = true;
                  configuringDoneNum = totalConfigureNum;
                  printConfigureError("Configuration Stopped.");
              }
              var anyDeviceFailed = false;
              for(var i in selectedDevices) {
                  if (!selectedDevices[i].isConfigComplete) {
                      anyDeviceFailed = true;
                  }
              }
              if (anyDeviceFailed) {
                  printConfigureError("\nFollowing devices are NOT completely configured:");
                  for(var i in selectedDevices) {
                      if (!selectedDevices[i].isConfigComplete) {
                          printConfigureError(deviceToString(selectedDevices[i]));
                      } else {
                          printAndAppendConfigureResult(deviceToString(selectedDevices[i]));
                      }
                  }   
              } else {
                  printAndAppendConfigureResult("Good. All devices are done configuration.");
              }
              stopConfigure();
              var currentTime = new Date();
              var timeDiff = currentTime - configTimeStart;
              console.log("It took " + timeDiff/1000 + " seconds to configure devices.");
          }

      }

      function printConfigureError(msg, data, error) {
          var oldMsg = vm.deviceConfigureFailResult?vm.deviceConfigureFailResult:"";
          if (oldMsg) oldMsg+= "\n";
          vm.deviceConfigureFailResult = oldMsg + msg;
          if (data && data.data) {
              var jsonObj = data.data
              vm.deviceConfigureFailResult = vm.deviceConfigureFailResult + 
                  "\nHTTP " + data.status + " " + data.statusText + "\n" +
                  "Responsed JSON content: " + JSON.stringify(jsonObj);
          }
          if (error) {
              vm.deviceConfigureFailResult += "\n\nError:\n"
              vm.deviceConfigureFailResult += error.message + "\n";
              vm.deviceConfigureFailResult += error.stack + "\n";
          }

          //vm.deviceConfigureFailResult += "\nPlease check console log to see if there are more information.\n"
      }

      function printAndAppendConfigureResult(msg, data) {
          vm.deviceConfigureResult = vm.deviceConfigureResult + (vm.deviceConfigureResult? "\n": "") + msg;
          if (data) {
              vm.deviceConfigureResult = vm.deviceConfigureResult + "\n" + JSON.stringify(data.data, null, 2);
          }
      }

      function clearConfigureResult() {
          vm.deviceConfigureResult = "";
          vm.deviceConfigureFailResult = "";
      }
      // ---------- End of For Configure Tab ----------


      // ---------- Utils ----------


      function deviceToString(device) {
          return device.ip + " " +
              device.model_id + " (" +
              device.player_name + ") " +
              device.serial_number;
      }

      function isIpRangeValid(start_ip, end_ip) {
          var start_prefix = start_ip.replace(/\.[\d]+$/, '');
          var end_prefix = end_ip.replace(/\.[\d]+$/, '');
          if (start_prefix == end_prefix) {
              return true;
          }
          return false;
      }
      function ValidateIPaddress(ipaddress) {
          var patt = new RegExp(vm.ipPattern);
          if (patt.test(ipaddress)) {
              return true;
          }
          return false;
      }
      function convertConfiguration() {
          vm.configure.SettingsRebootTime = new Date(vm.configure.SettingsRebootTime);
          vm.configure.SettingsScheduleOn = new Date(vm.configure.SettingsScheduleOn);
          vm.configure.SettingsScheduleOff = new Date(vm.configure.SettingsScheduleOff);
          if(vm.configure.TextMessage.broadcast_customTime) vm.configure.TextMessage.broadcast_customTime = new Date(vm.configure.TextMessage.broadcast_customTime);
      }



      function getLocalIp(getIpFn) {
          // NOTE: window.RTCPeerConnection is "not a constructor" in FF22/23
          var RTCPeerConnection = /*window.RTCPeerConnection ||*/ window.webkitRTCPeerConnection || window.mozRTCPeerConnection;

          if (RTCPeerConnection) (function () {
              var rtc = new RTCPeerConnection({iceServers:[]});
              if (1 || window.mozRTCPeerConnection) {      // FF [and now Chrome!] needs a channel/stream to proceed
                  rtc.createDataChannel('', {reliable:false});
              };

              rtc.onicecandidate = function (evt) {
                  // convert the candidate to SDP so we can run it through our general parser
                  // see https://twitter.com/lancestout/status/525796175425720320 for details
                  if (evt.candidate) grepSDP("a="+evt.candidate.candidate);
              };
              rtc.createOffer(function (offerDesc) {
                  grepSDP(offerDesc.sdp);
                  rtc.setLocalDescription(offerDesc);
              }, function (e) { console.warn("offer failed", e); });


              var addrs = Object.create(null);
              addrs["0.0.0.0"] = false;
              //updateDisplay("2001::9d38:6abd:18ce:959:3f57:feeb");
              //addrs["192.168.0.43"] = true;
              //addrs["192.168.2.43"] = true;
              /*
              for (var i = 19; i<=20;i++) {
                  if (i == 1) continue;
                  addrs["192.168." + i + ".43"] = true;
              }
              addrs["192.168." + 1 + ".43"] = true;
              for (var i = 21; i<=30;i++) {
                  addrs["192.168." + i + ".43"] = true;
              }
              */
              var timeoutHandler = $timeout(function(addrs) {getIpFn(addrs);}, 3000, true, null);
              function updateDisplay(newAddr) {
                  if (!ValidateIPaddress(newAddr)) return;
                  if (newAddr in addrs) return;
                  else addrs[newAddr] = true;
                  var displayAddrs = Object.keys(addrs).filter(function (k) {
                      return addrs[k];
                  });
                  $timeout.cancel(timeoutHandler);
                  timeoutHandler = $timeout(function(addrs) {getIpFn(addrs);}, 1000, true, displayAddrs);
              }

              function grepSDP(sdp) {
                  var hosts = [];
                  sdp.split('\r\n').forEach(function (line) { // c.f. http://tools.ietf.org/html/rfc4566#page-39
                      if (~line.indexOf("a=candidate")) {     // http://tools.ietf.org/html/rfc4566#section-5.13
                          var parts = line.split(' '),        // http://tools.ietf.org/html/rfc5245#section-15.1
                              addr = parts[4],
                              type = parts[7];
                          if (type === 'host') updateDisplay(addr);
                      } else if (~line.indexOf("c=")) {       // http://tools.ietf.org/html/rfc4566#section-5.7
                          var parts = line.split(' '),
                              addr = parts[2];
                          updateDisplay(addr);
                      }
                  });
              }
          })(); else {
              return false;
          }
          return true;
      }

      function onGetIp(addrs) {
          if (vm.ipCandidates.length == 0) {
              if (!addrs || addrs.length == 0) {
                  vm.ipCandidates.push({});
              } else {
                  var tmpRange = Object.create(null);
                  for (var i = 0; i< addrs.length; i++) {
                      var range_start = addrs[i].replace(/\.[\d]+$/, '.1');
                      var range_end = addrs[i].replace(/\.[\d]+$/, '.254');
                      if (range_start in tmpRange) {
                          continue;
                      }
                      tmpRange[range_start] = true;
                      vm.ipCandidates.push({
                          range_start: range_start,
                          range_end: range_end,
                          index: vm.ipCandidates.length
                      });
                  }
              }
          }
          vm.isScanDisabled = false;
          checkRemoveRangeButton();
      }

      function translateStreamVolume(value) {
          if (value == -1 || isNaN(value)) {
              return "";
          }
          return value;
      }

      function deleteConfig(configKey) {
          delete vm.configure[configKey];
      }
      function checkInitConfig(configKey, isChecked, value, isInitRebootTime) {
          if (isChecked) {
              if (configKey == "SettingsScheduleOffDays") {
                  vm.configure[configKey].sunday = value;
                  vm.configure[configKey].monday = value;
                  vm.configure[configKey].tuesday = value;
                  vm.configure[configKey].wednesday = value;
                  vm.configure[configKey].thursday = value;
                  vm.configure[configKey].friday = value;
                  vm.configure[configKey].saturday = value;
              } else if (isInitRebootTime) {
                  var d = new Date("January 1, 1972 04:00:00");
                  vm.configure[configKey] = d;
              } else if (typeof value == 'undefined') {
                  //vm.configure[configKey] = "";
              } else {
                  vm.configure[configKey] = value;
              }
          } else if (!isChecked && vm.configure.hasOwnProperty(configKey)) {
              //delete vm.configure[configKey];
              if (isInitRebootTime) {
                  vm.formScope.ConfigForm['rebootTime'].$setViewValue(undefined, true);
                  vm.formScope.ConfigForm['rebootTime'].$render();
              }
          }
      }
      function checkEthernetConfig(isChecked, firstLvKey, configKey, value) {
          if (isChecked) {
              vm.configure.EthernetNetwork = {
                  ip_assignment: 'dhcp'
              }
          } else {
              if (vm.configure.hasOwnProperty('EthernetNetwork')){
                  delete vm.configure['EthernetNetwork'];
              }
          }
      }
      function checkInitWifiConfig(isChecked) {
          if (isChecked) {
              vm.configure.WifiNetwork = {
                  method: 'connect',
                  security: 'none',
                  ssid: '',
                  advanced: {ip_assignment: 'dhcp'}
              }
          } else {
              if (vm.configure.hasOwnProperty('WifiNetwork')) {
                  delete vm.configure['WifiNetwork'];
              }
          }
      }
      
      function changeAppSelect() {
          var status = false,
              count = 0,
              devIndex = -1;
          for (var i in vm.scannedDevices) {
              if (vm.scannedDevices[i].isSelected) {
                  devIndex = i;
                  ++count;
                  status = true;
              }
          }
          if(count == 1) {
              delete vm.AppInfo;
              if(vm.config_device_os=='android') {
                   QRC.getAppInfo(vm.configure.AppSelect.pkgname, devIndex).then(function(data) {
                      data = data.data
                      data.first_install_time = new Date(data.first_install_time).toLocaleString('en-US');
                      data.last_update_time = new Date(data.last_update_time).toLocaleString('en-US');
                      vm.AppInfo = data;
                  });   
              } else {
                  vm.AppInfo = vm.configure.AppSelect;
              }
          }
      }
      
      function changeExportMethod() {
          if (vm.remote_or_export=='remote') {
              vm.startConfigString = 'Start Configuration';
              vm.current_password = "";
          } else {
              vm.startConfigString = 'Export for USB';
              vm.current_password = "12345678";
          }
          console.log("changeExportMethod:" + vm.remote_or_export);
      }
      
      function changeConfigDevice() {
          console.log("changeConfigDevice()");
          for(var idx in vm.displayScannedDevices) {
              vm.displayScannedDevices[idx].isSelected = false;
          }
          delete vm.configure.AppList;
          delete vm.configure.AppSelect;
          delete vm.AppInfo;
          checkReadyToConfigure();
      }

      function watchScannedDevices() {
          $scope.$watch(
              'vm.displayScannedDevices', function(newValue) {
                  checkAllDisplayDevicesSelected();
              });
      }

      function watchSliders() {
          $scope.$watch('vm.accordion.audioOpen', function(newValue) {
              $scope.$broadcast('rzSliderForceRender');
          });
      }

      function checkAllDisplayDevicesSelected() {
          if (!vm.displayScannedDevices.length) {
              vm.STableSelectAllDevices = false;
              return;
          }
          vm.STableSelectAllDevices = true;
          for (var i in vm.displayScannedDevices) {
              if (!vm.displayScannedDevices[i].isSelected) {
                  vm.STableSelectAllDevices = false;
                  break;
              }
          }
      }
  }


  angular
      .module('qrc-center.configuration.controllers')
      .filter('myStrictFilter', function($filter){
      return function(input, predicate){
          return $filter('filter')(input, predicate, true);
      }
  });

  angular
      .module('qrc-center.configuration.controllers')
      .filter('unique', function() {
      return function (arr, field) {
          var o = {}, i, l = arr.length, r = [];
          for(i=0; i<l;i+=1) {
              o[arr[i][field]] = arr[i];
          }
          for(i in o) {
              r.push(o[i]);
          }
          return r;
      };
  });

})();
