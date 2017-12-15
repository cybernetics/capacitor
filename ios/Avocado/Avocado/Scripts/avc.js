(function(win) {
  win.Avocado = win.Avocado || {};

  // keep a collection of callbacks for native response data
    var calls = {};

  // keep a counter of callback ids
  var callbackIdCount = 0;

  var avocado = Avocado;

  // create the postToNative() fn if needed
  if (win.androidBridge) {
    // android platform
    postToNative = function androidBridge(data) {
      win.androidBridge.postMessage(JSON.stringify(data));
    };
    avocado.isNative = true;
    avocado.platform = 'android';

  } else if (win.webkit && win.webkit.messageHandlers && win.webkit.messageHandlers.bridge) {
    // ios platform
    postToNative = function iosBridge(data) {
      data.type = 'message';
      win.webkit.messageHandlers.bridge.postMessage(data);
    };
    avocado.isNative = true;
    avocado.platform = 'ios';
  }

  // patch window.console and store original console fns
  var orgConsole = {};
  Object.keys(win.console).forEach(level => {
    if (typeof win.console[level] === 'function') {
      // loop through all the console functions and keep references to the original
      orgConsole[level] = win.console[level];

      win.console[level] = function avocadoConsole() {
        var msgs = Array.prototype.slice.call(arguments);

        // console log to browser
        orgConsole[level].apply(win.console, msgs);

        if (avocado.isNative) {
          // send log to native to print
          try {
            // convert all args to strings
            msgs = msgs.map(arg => {
              if (typeof arg === 'object') {
                try {
                  arg = JSON.stringify(arg);
                } catch (e) {}
              }
              // convert to string
              return arg + '';
            });
            avocado.toNative('Console', 'log', {
              level,
              message: msgs.join(' ')
            });

          } catch (e) {
            // error converting/posting console messages
            orgConsole.error.apply(win.console, e);
          }
        }
      };
    }
  });

  /**
   * Send a plugin method call to the native layer
   */
  avocado.toNative = function toNative(pluginId, methodName, options, storedCallback) {
    try {
      if (avocado.isNative) {
        let callbackId = '-1';

        if (storedCallback && (typeof storedCallback.callback === 'function' || typeof storedCallback.resolve === 'function')) {
          // store the call for later lookup
          callbackId = ++callbackIdCount + '';
          calls[callbackId] = storedCallback;
        }

        // post the call data to native
        postToNative({
          callbackId,
          pluginId,
          methodName,
          options: options || {}
        });

      } else {
        orgConsole.warn.call(win.console, `browser implementation unavailable for: ${pluginId}`);
      }

    } catch (e) {
      orgConsole.error.call(win.console, e);
    }
  };

  /**
   * Process a response from the native layer.
   */
  avocado.fromNative = function fromNative(result) {
    // get the stored call, if it exists
    try {
      const storedCall = calls[result.callbackId];

      if (storedCall) {
        // looks like we've got a stored call

        if (typeof storedCall.callback === 'function') {
          // callback
          if (result.success) {
            storedCall.callback(null, result.data);
          } else {
            storedCall.callback(result.error, null);
          }

        } else if (typeof storedCall.resolve === 'function') {
          // promise
          if (result.success) {
            storedCall.resolve(result.data);
          } else {
            storedCall.reject(result.error);
          }

          // no need to keep this stored callback
          // around for a one time resolve promise
          delete calls[result.callbackId];
        }

      } else if (!result.success && result.error) {
        // no stored callback, but if there was an error let's log it
        orgConsole.warn.call(win.console, result.error);
      }

    } catch (e) {
      orgConsole.error.call(win.console, e);
    }

    // always delete to prevent memory leaks
    // overkill but we're not sure what apps will do with this data
    delete result.data;
    delete result.error;
  };

  avocado.withPlugin = function withPlugin(_pluginId, _fn) {
  };

  avocado.nativeCallback = (pluginId, methodName, options, callback) {
    avocado.toNative(pluginId, methodName, options, {
      callback
    });
  };

  avocado.nativePromise = (pluginId, methodName, options) {
    return new Promise((resolve, reject) => {
      avocado.toNative(pluginId, methodName, options, {
        resolve,
        reject
      });
    });
  };

 
  avc.handleWindowError = function (msg, url, lineNo, columnNo, error) {
    var string = msg.toLowerCase();
    var substring = "script error";
    if (string.indexOf(substring) > -1) {
      // Some IE issue?
    } else {
      var errObj = {
        type: 'js.error',
        error: {
          message: msg,
          url: url,
          line: lineNo,
          col: columnNo,
          errorObject: JSON.stringify(error)
        }
      };
      window.Avocado.handleGlobalError(errObj);
      window.webkit.messageHandlers.avocado.postMessage(errObj);
    }

    return false;
  };

  window.onerror = avc.handleWindowError;
   
})();