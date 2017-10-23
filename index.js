import RNFetchBlob from 'react-native-fetch-blob';
import {NetInfo} from 'react-native';
import {EventEmitter, Timer} from '@progdesigner/node-utils';

class NetworkReachableManager {

    get emitter() {
        return this._eventEmitter;
    }

    get reachableType() {
        return this._reachableType;
    }

    set reachableType( value ) {
        if (!value) {
            return;
        }

        let wasValue = this._reachableType;
        this._reachableType = value ? value.toUpperCase() : 'UNKNOWN';

        if (__DEV__) {
            console.log( "Network - reachableType", value, this._reachableType );
        }

        if (wasValue !== this._reachableType) {
            this._eventEmitter.emit('change', this._reachableType);
        }
    }

    constructor() {

        this._reachableType = 'UNSET';
        this._eventEmitter = new EventEmitter();
        this._handler = (connectionInfo) => {
            this.reachableType = connectionInfo.type;
        };

        this._timeout = new Timer(1000, true);

        this.checkReachableType()
            .then(() => {
                NetInfo.addEventListener( 'connectionChange', this._handler );
            });
    }

    checkReachableType() {

        return new Promise((callback) => {
            NetInfo.getConnectionInfo().then((connectionInfo) => {
                this.reachableType = connectionInfo.type;
                callback(this.reachableType);
            });
        });
    }
}

const reachableManager = new NetworkReachableManager();

class NetworkManager {

    static errorStrings = {};
    static reachable = reachableManager;

    constructor(props = {}) {
        this._host = props.host || 'http://localhost';
        this._defaultHeaders = props.headers || {};
        this._timeout = props.timeout || 60000;
        this._onReceived = typeof props.onReceived === 'function' ? props.onReceived : function(response, options) {
            return response;
        };

        NetworkManager.errorStrings = props.errorStrings || NetworkManager.errorStrings;
    }

    onReceived(response, options = {}) {

        return new Promise((resolve, reject) => {
            let data = options && typeof options.onReceived === 'function' ? options.onReceived(response, options) : this._onReceived(response, options);

            resolve(data);
        });
    }

    _generateFormBody(data) {

        let formBody = [];
        for (let property in data) {
            let encodedKey = encodeURIComponent(property);
            let encodedValue = encodeURIComponent(data[property]);
            formBody.push(encodedKey + "=" + encodedValue);
        }
        formBody = formBody.join("&");
        return formBody;
    }

    fetch(url, options = {}) {

        var timeout = typeof options.timeout === 'number' ? options.timeout : this._timeout;
        var timeoutInstance = null;
        var fetchController = null;
        var closeConnection = ( about = false ) => {
            if (timeoutInstance != null) {
                clearTimeout(timeoutInstance);
                timeoutInstance = null;
            }

            if (about === true && fetchController) {
                fetchController.about();
            }
        };

        return new Promise((resolve, reject) => {

            timeoutInstance = setTimeout(function() {
                closeConnection(true);
                reject(new Error('-1:err_api_timeout'));
            }, timeout);

            fetch(url, options, (controller) => { fetchController = controller; })
                .then((response) => {
                    if (options.contentType === 'TEXT') {
                        return response.text();
                    }
                    return response.json();
                })
                .then((result) => {
                    closeConnection();
                    return this.onReceived(result, options);
                })
                .then((data) => {
                    resolve(data);
                })
                .catch((error) => {
                    closeConnection(true);
                    reject(error);
                });
        });
    }

    get(endpoint, options = {}) {

        var url = this._host + endpoint;
        var {
            headers,
            params,
            callback,
            useCache,
        } = options;

        url = url + "?" + this._generateFormBody(params);

        headers = headers || {};

        if (useCache === false) {
            headers['pragma'] = 'no-cache';
            headers['cache-control'] = 'no-cache';
        }

        headers['Content-Type'] = 'application/json';

        options['headers'] = headers;
        options['method'] = 'GET';

        return this.fetch(url, options);
    }

    post(endpoint, options = {}) {

        var url = this._host + endpoint;
        var {
            headers,
            formData,
            callback,
            useCache,
            useCookie
        } = options;

        headers = headers || this._defaultHeaders;

        if (useCache === false) {
            headers['pragma'] = 'no-cache';
            headers['cache-control'] = 'no-cache';
        }

        headers['Content-Type'] = 'application/x-www-form-urlencoded';

        if (useCookie === false) {
            headers['Cookie'] = '';
        }

        options['headers'] = headers;
        options['method'] = 'POST';
        options['body'] = this._generateFormBody(formData);

        return this.fetch(url, options);
    }

    upload(endpoint, options = {}) {

        var url = this._host + endpoint;
        var {
            headers,
            formData,
            files,
            callback,
            useCache,
            useCookie
        } = options;

        var formBody = [];
        var timeout = null;
        var fetchController = null;
        var closeConnection = ( about = false ) => {
            if (timeout != null) {
                clearTimeout(timeout);
                timeout = null;
            }

            if (about === true && fetchController) {
                fetchController.about();
            }
        };

        headers = headers || this._defaultHeaders;

        if (useCache === false) {
            headers['pragma'] = 'no-cache';
            headers['cache-control'] = 'no-cache';
        }

        headers['Content-Type'] = 'multipart/form-data';

        if (useCookie === false) {
            headers['Cookie'] = '';
        }

        files = files || [];

        for (let property in formData) {
            let encodedKey = encodeURIComponent(property);
            let encodedValue = encodeURIComponent(formData[property]);

            formBody.push({
                name: encodedKey,
                data: encodedValue
            });
        }

        for (let i=0; i<files.length; i++) {
            let fileData = files[i];
            let { name, file, fileName, fileType } = fileData;

            let fileBlob = RNFetchBlob.wrap(file.replace('file://', ''));

            formBody.push({
                name: name,
                filename: fileName,
                type: fileType,
                data: fileBlob
            });
        }

        return new Promise((resolve, reject) => {

            timeout = setTimeout(function() {
                closeConnection(true);
                reject(new Error('-1:err_api_timeout'));
            }, this._timeout);

            RNFetchBlob.fetch('POST', url, headers, formBody)
                .then((response) => {
                    if (options.contentType === 'TEXT') {
                        return response.text();
                    }
                    return response.json();
                })
                .then((result) => {
                    closeConnection();
                    return this.onReceived(result, options);
                })
                .then((data) => {
                    resolve(data);
                })
                .catch((error) => {
                    closeConnection(true);
                    reject(error);
                });
        });
    }
}

module.exports = NetworkManager;
