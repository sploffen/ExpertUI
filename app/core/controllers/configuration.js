/**
 * Configuration controller
 * @author Martin Vach
 */
// Redirect to new version of configuration
appController.controller('ConfigRedirectController', function($routeParams, $location, $cookies, $filter) {
    var configUrl = 'configuration/interview';
    var nodeId = function() {
        var id = 1;
        if ($routeParams.nodeId == undefined) {
            id = (angular.isDefined($cookies.configuration_id) ? $cookies.configuration_id : 1);
        } else {
            id = $routeParams.nodeId;
        }
        return id;
    };
    if (nodeId() == $cookies.configuration_id) {
        if (angular.isDefined($cookies.config_url)) {
            configUrl = $cookies.config_url;
        }
    } else {
        configUrl = configUrl + '/' + nodeId();
    }
//    console.log('$routeParams.nodeId: ' +  nodeId())
//    console.log('$cookies.configuration_id: ' + $cookies.configuration_id)
//    console.log(configUrl)
//    return;
    $location.path(configUrl);
});
// Device configuration Interview controller
appController.controller('ConfigInterviewController', function($scope, $routeParams, $location, $cookies, $filter, $http, dataService, deviceService, myCache) {
    $scope.devices = [];
    $scope.deviceId = 0;
    $scope.activeTab = 'interview';
    $scope.activeUrl = 'configuration/interview/';
    $cookies.tab_config = $scope.activeTab;
    $scope.modelSelectZddx = false;

    // Interview data
    $scope.descriptionCont;
    $scope.deviceZddx = [];
    // Load data
    $scope.load = function(nodeId) {
        //nodeId = parseInt(nodeId,10);
        dataService.getZwaveData(function(ZWaveAPIData) {
            $scope.ZWaveAPIData = ZWaveAPIData;
            $scope.devices = deviceService.configGetNav(ZWaveAPIData);
            var node = ZWaveAPIData.devices[nodeId];
            if (!node) {
                return;
            }

            $cookies.configuration_id = nodeId;
            $cookies.config_url = $scope.activeUrl + nodeId;
            $scope.deviceId = nodeId;
            $scope.deviceName = $filter('deviceName')(nodeId, node);

            setData(ZWaveAPIData, nodeId);
            dataService.joinedZwaveData(function(data) {
                node = data.joined.devices[nodeId];
                refreshData(node, nodeId, data.joined);
//                    $scope.reset();
//                    setNavigation(data.joined);
//                    setData(data.joined, nodeId, true);
                $scope.ZWaveAPIData = ZWaveAPIData;
            });
        });
    };
    $scope.load($routeParams.nodeId);

    // Redirect to detail page
    $scope.changeDevice = function(deviceId) {
        if (deviceId > 0) {
            $location.path($scope.activeUrl + deviceId);
        }
    };

    // Cancel interval on page destroy
    $scope.$on('$destroy', function() {
        dataService.cancelZwaveDataInterval();
    });

    /**
     * Rename Device action
     */
    $scope.renameDevice = function(form) {
        var deviceId = $scope.deviceId;
        var givenName = $('#' + form + ' #device_name').val();
        var cmd = 'devices[' + deviceId + '].data.givenName.value=\'' + givenName + '\'';
        dataService.runCmd(cmd, false, $scope._t('error_handling_data'));
        $('#config_device_name').html(givenName);
        $('#device_node_name').html(givenName);
        return;
    };

    // Store data on remote server
    $scope.store = function(btn) {
       dataService.runCmd($(btn).attr('data-store-url'), false, $scope._t('error_handling_data'));
    };
    
    // Show modal CommandClass dialog
    $scope.showModalCommandClass = function(target, instanceId, ccId, type) {
        var node = $scope.ZWaveAPIData.devices[$routeParams.nodeId];
        var ccData;
        switch(type){
            case 'cmdData':
                ccData = $filter('hasNode')(node, 'instances.' + instanceId + '.commandClasses.' + ccId + '.data');
                break;
           case 'cmdDataIn':
                ccData = $filter('hasNode')(node, 'instances.' + instanceId + '.data');
                break;
            default:
                ccData = $filter('hasNode')(node, 'data');
               break;
        }
        var cc = deviceService.configGetCommandClass(ccData, '/', '');

        $scope.commandClass = deviceService.configSetCommandClass(cc);
         $(target).modal();
    };

    // Show modal dialog
    $scope.showModalInterview = function(target) {
        $(target).modal();
    };

    // Show modal device select dialog
    $scope.showModalDeviceSelect = function(target, nodeId, alert) {
        dataService.getSelectZDDX(nodeId, function(data) {
            $scope.deviceZddx = data;
        }, alert);
        $(target).modal();

    };

    // Change device select
    $scope.changeDeviceSelect = function(selector, target,file) {
        var imageFile = $(selector).find(':selected').data('image');
        var image;
        if (imageFile == undefined) {
            image = $scope._t('no_device_image');
        } else {
            image = '<img src="' + imageFile + '" />';
        }
        $scope.modelSelectZddx = file;
        $(target).html(image);
    };

    // Update device zddx file
    $scope.runCmdDeviceSelect = function(nodeId) {
        var cmd = 'devices[' + nodeId + '].LoadXMLFile("' + $scope.modelSelectZddx + '")';
        dataService.runCmd(cmd, false, $scope._t('error_handling_data'));
        dataService.purgeCache();
        dataService.cancelZwaveDataInterval();
        $scope.load(nodeId);
    };

    /// --- Private functions --- ///
    /**
     * Set zwave data
     */
    function setData(ZWaveAPIData, nodeId, refresh) {
        var node = ZWaveAPIData.devices[nodeId];
        if (!node) {
            return;
        }
        $scope.showDevices = true;
        $scope.deviceName = $filter('deviceName')(nodeId, node);
        $scope.deviceNameId = $filter('deviceName')(nodeId, node) + ' (#' + nodeId + ')';
        $scope.hasBattery = 0x80 in node.instances[0].commandClasses;
        var zddXmlFile = null;
        if (angular.isDefined(node.data.ZDDXMLFile)) {
            zddXmlFile = node.data.ZDDXMLFile.value;
            $scope.deviceZddxFile = node.data.ZDDXMLFile.value;
        }

        $scope.interviewCommands = deviceService.configGetInterviewCommands(node, ZWaveAPIData.updateTime);
        $scope.interviewCommandsDevice = node.data;
        if (zddXmlFile && zddXmlFile !== 'undefined') {
            var cachedZddXml = myCache.get(zddXmlFile);
            // Uncached file
            //if (!cachedZddXml) {
            $http.get($scope.cfg.server_url + $scope.cfg.zddx_url + zddXmlFile).then(function(response) {
                var x2js = new X2JS();
                var zddXml = x2js.xml_str2json(response.data);
                myCache.put(zddXmlFile, zddXml);
                $scope.descriptionCont = setCont(node, nodeId, zddXml, ZWaveAPIData, refresh);


            });
            //} else {
            //$scope.descriptionCont = setCont(node, nodeId, cachedZddXml, ZWaveAPIData, refresh);
            //}

        } else {

            $scope.descriptionCont = setCont(node, nodeId, null, ZWaveAPIData, refresh);
        }
    }

    /**
     * Device description
     */
    function setCont(node, nodeId, zddXml, ZWaveAPIData, refresh) {

        // Set device data
        var deviceImage = 'app/images/no_device_image.png';
        var deviceDescription = '';
        var productName = '';
        var inclusionNote = '';
        var brandName = node.data.vendorString.value;
        var wakeupNote = '';
        var ZWavePlusRoles = [];
        var securityInterview = '';
        var deviceDescriptionAppVersion = parseInt(node.data.applicationMajor.value, 10);
        var deviceDescriptionAppSubVersion = parseInt(node.data.applicationMinor.value, 10);
        if (isNaN(deviceDescriptionAppVersion))
            deviceDescriptionAppVersion = '-';
        if (isNaN(deviceDescriptionAppSubVersion))
            deviceDescriptionAppSubVersion = '-';
        var zwNodeName = '';
        if (0x77 in node.instances[0].commandClasses) {
            // NodeNaming
            zwNodeName = node.instances[0].commandClasses[0x77].data.nodename.value;
            if (zwNodeName != '') {
                zwNodeName = ' (' + zwNodeName + ')';
            }


        }
        // Security interview
        if (0x98 in node.instances[0].commandClasses) {
            securityInterview = node.instances[0].commandClasses[0x98].data.securityAbandoned.value;
        }

        var sdk;
        if (node.data.SDK.value == '') {
            sdk = '(' + node.data.ZWProtocolMajor.value + '.' + node.data.ZWProtocolMinor.value + ')';
        } else {
            sdk = node.data.SDK.value;
        }

        // Command class
        var ccNames = [];
        angular.forEach($scope.interviewCommands, function(v, k) {
            ccNames.push(v.ccName);
        });
        // Has device a zddx XML file
        if (zddXml) {
            deviceDescription = deviceService.configGetZddxLang($filter('hasNode')(zddXml, 'ZWaveDevice.deviceDescription.description.lang'), $scope.lang);
            inclusionNote = deviceService.configGetZddxLang($filter('hasNode')(zddXml, 'ZWaveDevice.deviceDescription.inclusionNote.lang'), $scope.lang);
             wakeupNote = deviceService.configGetZddxLang($filter('hasNode')(zddXml, 'ZWaveDevice.deviceDescription.wakeupNote.lang'), $scope.lang);

            if ('brandName' in zddXml.ZWaveDevice.deviceDescription) {
                brandName = zddXml.ZWaveDevice.deviceDescription.brandName;
            }
            
            if ('productName' in zddXml.ZWaveDevice.deviceDescription) {
                productName = zddXml.ZWaveDevice.deviceDescription.productName;
            }
            
            if (angular.isDefined(zddXml.ZWaveDevice.resourceLinks)) {
                deviceImage = zddXml.ZWaveDevice.resourceLinks.deviceImage._url;
            }
            /**
             * TODO: finish ZWavePlusRoles
             */
            if (angular.isDefined(zddXml.ZWaveDevice.RoleTypes)) {
                angular.forEach(zddXml.ZWaveDevice.RoleTypes, function(v, k) {
                    ZWavePlusRoles.push(v);
                });
            }
        }

        // Set device image
        $scope.deviceImage = deviceImage;
        // OBJ
        var obj = {};
        obj["a"] = {"key": "device_node_id", "val": nodeId};
        obj["b"] = {"key": "device_node_name", "val": $filter('deviceName')(nodeId, node)};
        obj["c"] = {"key": "device_node_type", "val": ''};
        obj["d"] = {"key": "device_description_brand", "val": brandName};
        obj["e"] = {"key": "device_description_device_type", "val": node.data.deviceTypeString.value};
        obj["f"] = {"key": "device_description_product", "val": productName};
        obj["g"] = {"key": "device_description_description", "val": deviceDescription};
        obj["h"] = {"key": "device_description_inclusion_note", "val": inclusionNote};
        obj["i"] = {"key": "device_description_wakeup_note", "val": wakeupNote};
        obj["j"] = {"key": "device_description_interview", "val": deviceService.configInterviewStage(ZWaveAPIData, nodeId, $scope.languages)};
        obj["k"] = {"key": "device_sleep_state", "val": deviceService.configDeviceState(node, $scope.languages)};
        //obj["l"] = {"key": "device_queue_length", "val": queueLength(ZWaveAPIData, node)};
        obj["m"] = {"key": "device_description_app_version", "val": deviceDescriptionAppVersion + '.' + deviceDescriptionAppSubVersion};
        obj["o"] = {"key": "device_description_sdk_version", "val": sdk};
        obj["p"] = {"key": "command_class", "val": ccNames};
        obj["q"] = {"key": "zwave_role_type", "val": ZWavePlusRoles.join(', ')};
        if (deviceService.isLocalyReset(node)) {
            obj["r"] = {"key": "device_reset_locally", "val": '<i class="' + $filter('checkedIcon')(true) + '"></i>'};
        }
        if (typeof securityInterview === 'boolean') {
            obj["s"] = {"key": "device_security_interview", "val": '<i class="' + $filter('checkedIcon')(securityInterview === true ? false : true) + '"></i>'};
        }
        return obj;
    }

    /**
     * Refresh description cont
     */
    function refreshData(node, nodeId, ZWaveAPIData) {
        $scope.interviewCommands = deviceService.configGetInterviewCommands(node, ZWaveAPIData.updateTime);
        $('#device_sleep_state .config-interview-val').html(deviceService.configDeviceState(node, $scope.languages));
        $('#device_description_interview .config-interview-val').html(deviceService.configInterviewStage(ZWaveAPIData, nodeId, $scope.languages));
    }
});
// Device configuration Configuration controller
appController.controller('ConfigConfigurationController', function($scope, $routeParams, $location, $cookies, $filter, $http, $timeout, dataService, deviceService, myCache) {
    $scope.devices = [];
    $scope.deviceId = 0;
    $scope.activeTab = 'configuration';
    $scope.activeUrl = 'configuration/configuration/';
    $cookies.tab_config = $scope.activeTab;
    $scope.reset = function() {
        $scope.devices = angular.copy([]);
    };
    // Config vars
    $scope.deviceZddx = [];
    $scope.configCont;
    $scope.switchAllCont;
    $scope.protectionCont;
    $scope.wakeupCont;

    // Load data
    // Load data
    $scope.load = function(nodeId) {
        dataService.getZwaveData(function(ZWaveAPIData) {
            $scope.ZWaveAPIData = ZWaveAPIData;
            $scope.devices = deviceService.configGetNav(ZWaveAPIData);
            var node = ZWaveAPIData.devices[nodeId];
            if (!node) {
                return;
            }

            $scope.getNodeDevices = function() {
                var devices = [];
                angular.forEach($scope.devices, function(v, k) {
                    if (devices_htmlSelect_filter($scope.ZWaveAPIData, 'span', v.id, 'node')) {
                        return;
                    }
                    ;
                    var obj = {};
                    obj['id'] = v.id;
                    obj['name'] = v.name;
                    devices.push(obj);
                });
                return devices;
            };

            $cookies.configuration_id = nodeId;
            $cookies.config_url = $scope.activeUrl + nodeId;
            $scope.deviceId = nodeId;
            $scope.deviceName = $filter('deviceName')(nodeId, node);

            setData(ZWaveAPIData, nodeId);

        });
    };
    $scope.load($routeParams.nodeId);

    // Refresh data
    $scope.refresh = function(nodeId) {
        dataService.joinedZwaveData(function(data) {
            setData(data.joined, nodeId, true);
        });
    };
    //$scope.refresh($routeParams.nodeId); 

    // Redirect to detail page
    $scope.changeDevice = function(deviceId) {
        if (deviceId > 0) {
            $location.path($scope.activeUrl + deviceId);
        }
    };

    // Cancel interval on page destroy
    $scope.$on('$destroy', function() {
        dataService.cancelZwaveDataInterval();
    });

    /**
     * Update from device action
     *
     * @param {string} cmd
     * @returns {undefined}
     */
    $scope.updateFromDevice = function(cmd, hasBattery) {
        if (hasBattery) {
            alert($scope._t('conf_apply_battery'));
        }
        dataService.runCmd(cmd, false, $scope._t('error_handling_data'));
        $scope.refresh = true;
        var timeOut;
        timeOut = $timeout(function() {
            $scope.refresh = false;
        }, 10000);
        return;
    };

    /**
     * Update from device - configuration section
     */
    $scope.updateFromDeviceCfg = function(cmd, cfg, deviceId) {
        angular.forEach(cfg, function(v, k) {
            if (v.confNum) {
                var request = cmd + '(' + v.confNum + ')';
                dataService.runCmd(request);
            }
        });
        $scope.refresh(deviceId);
        var timeOut;
        timeOut = $timeout(function() {
            dataService.cancelZwaveDataInterval();
        }, 10000);
        return;
    };

    /**
     * Apply Config action
     */
    $scope.submitApplyConfigCfg = function(form, cmd, cfgValues, hasBattery, confNum,setDefault) {
        var xmlData = [];
        var configValues = [];
        if (hasBattery) {
            alert($scope._t('conf_apply_battery'));
        }
        var data = $('#' + form).serializeArray();
        var dataValues = [];
        
        angular.forEach(data, function(v, k) {
            if (v.value !== '') {
                dataValues.push({"value": v.value, "name": v.name});
            }

        });
        angular.forEach(dataValues, function(n, nk) {
            var obj = {};
            var parameter;
            var lastNum = n.name.match(/\d+$/);
            if (!lastNum) {
                return;
            }
             
            var num = lastNum[0];
            //console.log('num', num)
            var confSize = 0;
            var value = n.value;
            if(angular.isObject(setDefault) && setDefault.confNum == num){
                value = setDefault.showDefaultValue;
            }
            configValues.push(value)
            angular.forEach(cfgValues, function(cv, ck) {
               if (!cv) {
                    return;
                }
                if (cv.confNum == num) {
                    confSize = cv.confSize;
                }


            });
            if (num > 0) {
                parameter = num + ',' + value + ',' + confSize;
            } else {
                parameter = value;
            }

            obj['id'] = cmd['id'];
            obj['instance'] = cmd['instance'];
            obj['commandclass'] = cmd['commandclass'];
            obj['command'] = cmd['command'];
            obj['parameter'] = '[' + parameter + ']';
            obj['parameterValues'] = parameter;
            obj['confNum'] = num;

            xmlData.push(obj);


        });
        //console.log(xmlData)
        //return;

        // Send command
        var request = 'devices[' + cmd.id + '].instances[' + cmd.instance + '].commandClasses[0x' + cmd.commandclass + '].';
        switch (cmd['commandclass']) {
            case '70':// Config
                angular.forEach(xmlData, function(v, k) {

                    var configRequest = request;
                    configRequest += cmd.command + '(' + v.parameterValues + ')';
                    if (confNum) {
                        if (confNum == v.confNum) {
                            dataService.runCmd(configRequest, false, $scope._t('error_handling_data'));
                        }
                    } else {
                        dataService.runCmd(configRequest, false, $scope._t('error_handling_data'));
                    }

                });
                break;
            case '75':// Protection
                request += cmd.command + '(' + configValues.join(",") + ')';
                dataService.runCmd(request, false, $scope._t('error_handling_data'));
                break;
            case '84':// Wakeup
                request += cmd.command + '(' + configValues.join(",") + ')';
                dataService.runCmd(request, false, $scope._t('error_handling_data'));
                break;
            case '27':// Switch all
                request += cmd.command + '(' + configValues.join(",") + ')';
                dataService.runCmd(request, false, $scope._t('error_handling_data'));
                break;
            default:
                break;
        }

        dataService.getCfgXml(function(cfgXml) {
            var xmlFile = deviceService.buildCfgXml(xmlData, cfgXml, cmd['id'], cmd['commandclass']);
            dataService.putCfgXml(xmlFile);
        });


        //debugger;
        $scope.refresh(cmd['id']);
        var timeOut;
        timeOut = $timeout(function() {
            $('button .fa-spin,a .fa-spin').fadeOut(1000);
            dataService.cancelZwaveDataInterval();
        }, 10000);
        return;
    };


    /// --- Private functions --- ///
    /**
     * Set zwave data
     */
    function setData(ZWaveAPIData, nodeId, refresh) {
        var node = ZWaveAPIData.devices[nodeId];
        if (!node) {
            return;
        }
        $scope.showDevices = true;
        $scope.deviceName = $filter('deviceName')(nodeId, node);
        $scope.deviceNameId = $filter('deviceName')(nodeId, node) + ' (#' + nodeId + ')';
        $scope.hasBattery = 0x80 in node.instances[0].commandClasses;
        var zddXmlFile = null;
        if (angular.isDefined(node.data.ZDDXMLFile)) {
            zddXmlFile = node.data.ZDDXMLFile.value;
            $scope.deviceZddxFile = node.data.ZDDXMLFile.value;
        }

        $scope.interviewCommands = deviceService.configGetInterviewCommands(node, ZWaveAPIData.updateTime);
        $scope.interviewCommandsDevice = node.data;
        if (zddXmlFile && zddXmlFile !== 'undefined') {
            var cachedZddXml = myCache.get(zddXmlFile);
            // Uncached file
            if (!cachedZddXml) {
                $http.get($scope.cfg.server_url + $scope.cfg.zddx_url + zddXmlFile).then(function(response) {
                    var x2js = new X2JS();
                    var zddXml = x2js.xml_str2json(response.data);
                    myCache.put(zddXmlFile, zddXml);
                    setCont(node, nodeId, zddXml, ZWaveAPIData, refresh);


                });
            } else {
                setCont(node, nodeId, cachedZddXml, ZWaveAPIData, refresh);
            }

        } else {

            setCont(node, nodeId, null, ZWaveAPIData, refresh);
        }
    }

    /**
     * Set all conts
     */
    function setCont(node, nodeId, zddXml, ZWaveAPIData, refresh) {
        if (!zddXml) {
            $scope.noZddx = true;
        }
        dataService.getCfgXml(function(cfgXml) {
            $scope.configCont = deviceService.configConfigCont(node, nodeId, zddXml, cfgXml, $scope.lang, $scope.languages);
            $scope.wakeupCont = deviceService.configWakeupCont(node, nodeId, ZWaveAPIData, cfgXml);
            $scope.protectionCont = deviceService.configProtectionCont(node, nodeId, ZWaveAPIData, cfgXml);
            $scope.switchAllCont = deviceService.configSwitchAllCont(node, nodeId, ZWaveAPIData, cfgXml);
        });
    }



});
// Device configuration commands controller
appController.controller('ConfigCommandsController', function($scope, $routeParams, $location, $cookies, $timeout, $filter, dataService, deviceService) {
    $scope.devices = [];
    $scope.commands = [];
    $scope.interviewCommands;

    $scope.deviceId = 0;
    $scope.activeTab = 'commands';
    $scope.activeUrl = 'configuration/commands/';

    $cookies.tab_config = $scope.activeTab;

    // Load data
    $scope.load = function(nodeId) {
        dataService.getZwaveData(function(ZWaveAPIData) {
            $scope.ZWaveAPIData = ZWaveAPIData;
            $scope.devices = deviceService.configGetNav(ZWaveAPIData);
            var node = ZWaveAPIData.devices[nodeId];
            if (!node) {
                return;
            }
            $scope.getNodeDevices = function() {
                var devices = [];
                angular.forEach($scope.devices, function(v, k) {
                    if (devices_htmlSelect_filter($scope.ZWaveAPIData, 'span', v.id, 'node')) {
                        return;
                    }
                    ;
                    var obj = {};
                    obj['id'] = v.id;
                    obj['name'] = v.name;
                    devices.push(obj);
                });
                return devices;
            };
            $scope.interviewCommands = deviceService.configGetInterviewCommands(node, ZWaveAPIData.updateTime);
            $cookies.configuration_id = nodeId;
            $cookies.config_url = $scope.activeUrl + nodeId;
            $scope.deviceId = nodeId;

            /**
             * Expert commands
             */
            angular.forEach(node.instances, function(instance, instanceId) {
                angular.forEach(instance.commandClasses, function(commandClass, ccId) {
                    var methods = getMethodSpec(ZWaveAPIData, nodeId, instanceId, ccId, null);
                    var command = deviceService.configGetCommands(methods, ZWaveAPIData);
                    var obj = {};
                    obj['nodeId'] = nodeId;
                    obj['rowId'] = 'row_' + nodeId + '_' + ccId;
                    obj['instanceId'] = instanceId;
                    obj['ccId'] = ccId;
                    obj['cmd'] = 'devices[' + nodeId + '].instances[' + instanceId + '].commandClasses[' + ccId + ']';
                    obj['cmdData'] = ZWaveAPIData.devices[nodeId].instances[instanceId].commandClasses[ccId].data;
                    obj['cmdDataIn'] = ZWaveAPIData.devices[nodeId].instances[instanceId].data;
                    obj['commandClass'] = commandClass.name;
                    obj['command'] = command;
                    obj['updateTime'] = ZWaveAPIData.updateTime;
                    $scope.commands.push(obj);
                });
            });
        });
    };
    $scope.load($routeParams.nodeId);

    // Redirect to detail page
    $scope.changeDevice = function(deviceId) {
        if (deviceId > 0) {
            $location.path($scope.activeUrl + deviceId);
        }
    };
    
    /**
     * Refresh data
     *
     */
    $scope.refresh = function() {
        dataService.joinedZwaveData(function(data) {
            
        });
    };
    $scope.refresh();

    /**
     * Submit expert commands form
     */
    $scope.submitExpertCommndsForm = function(form, cmd) {
        //var data = $('#' + form).serialize();
        var data = $('#' + form).serializeArray();
        var dataJoined = [];
        angular.forEach(data, function(v, k) {
             if (v.value === '') {
                return;
                //dataJoined.push('\'\'');
            }else{
                if(isNaN(v.value)){
                     dataJoined.push('\'' + v.value + '\'');
                }else{
                    dataJoined.push(v.value); 
                }
            }

        });
        var request = cmd + '(' + dataJoined.join() + ')';
        dataService.runCmd(request, false, $scope._t('error_handling_data'));
        //$scope.refresh = true;
        var timeOut;
        timeOut = $timeout(function() {
            $('button .fa-spin,a .fa-spin').fadeOut(1000);
            //$scope.refresh = false;
        }, 10000);
        return;
    };

    // Show modal dialog
    $scope.showModal = function(target, instanceId, index, ccId, type) {
        var node = $scope.ZWaveAPIData.devices[$routeParams.nodeId];
        var ccData = $filter('hasNode')(node, 'instances.' + instanceId + '.data');
        if (type == 'cmdData') {
            ccData = $filter('hasNode')(node, 'instances.' + instanceId + '.commandClasses.' + ccId + '.data');
        }
        var cc = deviceService.configGetCommandClass(ccData, '/', '');

        $scope.commandClass = deviceService.configSetCommandClass(cc, $scope.commands[index]['updateTime']);
        /**
         * Refresh data
         */
        dataService.joinedZwaveData(function(data) {
            node = data.joined.devices[$routeParams.nodeId];
            //console.log(node.instances)
            var newCc = $filter('hasNode')(node, 'instances.' + instanceId + '.data');
            if (type == 'cmdData') {
                newCc = $filter('hasNode')(node, 'instances.' + instanceId + '.commandClasses.' + ccId + '.data');
            }
            if (newCc) {
                 if (JSON.stringify(ccData) === JSON.stringify(newCc)) {
                    return;
                }
                $scope.commandClass = deviceService.configSetCommandClass(deviceService.configGetCommandClass(newCc, '/', ''), data.joined.updateTime);
            }
        });
        $(target).modal();
    };
    // Show modal dialog
    $scope.hideModal = function() {
        dataService.cancelZwaveDataInterval();
       
    };

    /// --- Private functions --- ///
    

});
// Device configuration firmware controller
appController.controller('ConfigFirmwareController', function($scope, $routeParams, $location, $cookies, dataService, deviceService) {
    $scope.devices = [];
    $scope.deviceId = 0;
    $scope.activeTab = 'firmware';
    $scope.activeUrl = 'configuration/firmware/';
    $scope.showForm = false;
    $scope.formFirmware = {};
    $scope.firmwareProgress = 0;

    $cookies.tab_config = $scope.activeTab;

    // Load data
    $scope.load = function(nodeId) {
        dataService.getZwaveData(function(ZWaveAPIData) {
            $scope.devices = deviceService.configGetNav(ZWaveAPIData);
            var node = ZWaveAPIData.devices[nodeId];
            if (!node) {
                return;
            }
            // Remember device id
            $cookies.configuration_id = nodeId;
            $cookies.config_url = $scope.activeUrl + nodeId;
            $scope.deviceId = nodeId;

            if (0x7a in node.instances[0].commandClasses) {
                $scope.showForm = true;
            }
        });
    };
    $scope.load($routeParams.nodeId);

    // Redirect to detail page
    $scope.changeDevice = function(deviceId) {
        if (deviceId > 0) {
            $location.path($scope.activeUrl + deviceId);
        }
    };
    /**
     * update Firmware
     * todo: complete this function
     */
    $scope.updateFirmware = function(nodeId) {
        if (!$scope.formFirmware.url && !$scope.formFirmware.targetId) {
            return;
        }
        // $('.fa-spin').show();

        // File upload test
        var data = {
            'url': $scope.formFirmware.url,
            'file': $scope.myFile,
            'targetId': $scope.formFirmware.targetId
        };

//        dataService.joinedZwaveData(function(data) {
//            $scope.firmwareProgress++;
//            console.log($filter('hasNode')(data.update,'FirmwareUpdate.data.fragmentTransmitted.value'));
//            
////                refresh(data.update);
//        });

        // Watch for progress change
        $scope.$watch('firmwareProgress', function() {
            if ($scope.firmwareProgress >= 100) {
                $('.fa-spin').fadeOut();
                dataService.cancelZwaveDataInterval();
            }

        });
        // Cancel interval on page destroy
        $scope.$on('$destroy', function() {
            dataService.cancelZwaveDataInterval();
        });

        dataService.fwUpdate(nodeId, data);
        return;
    };

});
