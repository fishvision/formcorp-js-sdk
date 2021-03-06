/**
 * FormCorp JS SDK
 * @author Alex Berriman <alexb@fishvision.com>
 * @website http://www.formcorp.com.au/
 *
 * Ability to embed a JS client side form on to an external webpage.
 */

/*global define,exports,require,jQuery,document,console,window,setInterval,fcAnalytics,escape,fcGreenID*/


if (!Date.now) {
    Date.now = function () {
        "use strict";
        return new Date().getTime();
    };
}

/**
 * Returns whether or not a string is valid json
 * @returns {boolean}
 */
String.prototype.isJson = function () {
    "use strict";

    try {
        jQuery.parseJSON(this);
        return true;
    } catch (ignore) {
    }

    return false;
};

/**
 * Escape a string for use in a regular expresion
 * @returns {*}
 */
String.prototype.escapeRegExp = function () {
    'use strict';
    return this.replace(/([.*+?\^=!:${}()|\[\]\/\\])/g, "\\$1");
};

/**
 * Set up
 */
(function (factory) {
    'use strict';

    if (typeof define === 'function' && define.amd) {
        define(['jquery'], factory);
    } else if (typeof exports === 'object') {
        factory(require('jquery'));
    } else {
        factory(jQuery);
    }
}(function ($) {
    'use strict';

    var pluses = /\+/g,
        config;

    /**
     * Encode a string
     * @param s
     * @returns {*}
     */
    function encode(s) {
        return encodeURIComponent(s);
    }

    /**
     * Decode a string
     * @param s
     * @returns {*}
     */
    function decode(s) {
        return decodeURIComponent(s);
    }

    /**
     * Properly encode a cookie value
     * @param value
     * @returns {*}
     */
    function stringifyCookieValue(value) {
        return encode(typeof (config.json) === 'boolean' && config.json ? JSON.stringify(value) : String(value));
    }

    /**
     * Parse a cookie value
     * @param s
     * @returns {*}
     */
    function parseCookieValue(s) {
        if (s.indexOf('"') === 0) {
            // This is a quoted cookie as according to RFC2068, unescape...
            s = s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }

        try {
            // Replace server-side written pluses with spaces.
            // If we can't decode the cookie, ignore it, it's unusable.
            // If we can't parse the cookie, ignore it, it's unusable.
            s = decodeURIComponent(s.replace(pluses, ' '));
            return config.json ? JSON.parse(s) : s;
        } catch (ignore) {
        }
    }

    /**
     * Read a cookie value.
     * @param s
     * @param converter
     * @returns {*}
     */
    function read(s, converter) {
        var value = config.raw ? s : parseCookieValue(s);
        return $.isFunction(converter) ? converter(value) : value;
    }

    /**
     * Set/get cookies
     * @type {Function}
     */

    config = $.cookie = function (key, value, options) {
        var days, t, result, cookies, i, l, parts, name, cookie;

        // Write
        if (arguments.length > 1 && !$.isFunction(value)) {
            options = $.extend({}, config.defaults, options);

            if (typeof options.expires === 'number') {
                days = options.expires;
                options.expires = new Date();
                t = options.expires;
                t.setTime(+t + days * 864e+5);
            }

            document.cookie = [
                encode(key), '=', stringifyCookieValue(value),
                options.expires ? '; expires=' + options.expires.toUTCString() : '', // use expires attribute, max-age is not supported by IE
                options.path ? '; path=' + options.path : '',
                options.domain ? '; domain=' + options.domain : '',
                options.secure ? '; secure' : ''
            ].join('');

            return (document.cookie);
        }

        // Read
        result = key ? undefined : {};
        cookies = document.cookie ? document.cookie.split('; ') : [];

        for (i = 0, l = cookies.length; i < l; i += 1) {
            parts = cookies[i].split('=');
            name = decode(parts.shift());
            cookie = parts.join('=');

            if (key && key === name) {
                // If second argument (value) is a function it's a converter...
                result = read(cookie, value);
                break;
            }

            // Prevent storing a cookie that we couldn't decode.
            if (!key) {
                cookie = read(cookie);
                if (cookie !== undefined) {
                    result[name] = cookie;
                }
            }
        }

        return result;
    };

    config.defaults = {};

    /**
     * Remove a cookie
     * @param key
     * @param options
     * @returns {boolean}
     */
    $.removeCookie = function (key, options) {
        if ($.cookie(key) === undefined) {
            return false;
        }

        // Must not alter options, thus extending a fresh object...
        $.cookie(key, '', $.extend({}, options, {expires: -1}));
        return !$.cookie(key);
    };

}));

/**
 * Main FC function
 */
var fc = (function ($) {
    'use strict';

    /**
     * Internal development occurs locally between ports 9000 and 9010
     * @type {boolean}
     */
    var scriptUrl = document.getElementById('fc-js-include').getAttribute('src'),

        isDev = scriptUrl.indexOf('192.168.') > -1,

        /**
         * Returns the base URL from the script path (host with optional port). Requires host to be an IP.
         * @param withPort
         * @returns {*}
         */
        baseUrl = function (withPort) {
            if (isDev) {
                if (withPort === undefined) {
                    withPort = true;
                }

                var re = withPort ? /\d+\.\d+\.\d+\.\d+[\:]{1}\d+/ : /\d+\.\d+\.\d+\.\d+/,
                    match = scriptUrl.match(re);

                if (match && match.length > 0) {
                    return match[0];
                }
            }
        },

        /**
         * The URL to query the API on (local dev defaults to port 9001)
         * @type {string}
         */
        apiUrl = !isDev ? '//api.formcorp.com.au/' : '//' + baseUrl(false) + ':9001/',

        /**
         * The URL to query the CDN on (local dev defaults to port 9004)
         * @type {string}
         */
        cdnUrl = !isDev ? '//cdn.formcorp.com.au/js/' : '//' + baseUrl(false) + ':9004/',

        /**
         * The URL of the Analytics javaqscript file
         * @type {string}
         */
        analyticsUrl = cdnUrl + 'analytics.js',

        /**
         * HTML encode a string.
         * @param html
         * @returns {*}
         */
        htmlEncode = function (html) {
            return document.createElement('a').appendChild(document.createTextNode(html)).parentNode.innerHTML;
        },

        /**
         * Load a css file on to the page
         *
         * @param file
         * @param media
         * @param cssId
         */
        loadCssFile = function (file, media, cssId) {
            var head, link;

            if (media === undefined) {
                media = 'all';
            }

            head = document.getElementsByTagName('head')[0];
            link = document.createElement('link');

            if (cssId !== undefined) {
                link.id = cssId;
            }

            link.rel = 'stylesheet';
            link.href = htmlEncode(file);
            link.media = media;
            head.appendChild(link);
        },

        /**
         * Load a javascript file
         * @param file
         */
        loadJsFile = function (filePath) {
            var file = document.createElement('script');

            file.setAttribute("type", "text/javascript");
            file.setAttribute("src", htmlEncode(filePath));

            $('body').append(file);
        },

        /**
         * Return the mongo id of an object instance.
         * @param obj
         * @returns {*}
         */
        getId = function (obj) {
            /*jslint nomen:true*/
            if (typeof obj === "object" && obj._id !== undefined && obj._id.$id !== undefined) {
                return obj._id.$id;
            }
            /*jslint nomen:false*/

            return "";
        },

        /**
         * Return a value from the field's configuration options.
         * @param field
         * @param key
         * @param defaultVal
         * @param jsonify
         * @returns {*}
         */
        getConfig = function (field, key, defaultVal, jsonify) {
            var json;

            if (defaultVal === undefined) {
                defaultVal = '';
            }

            if (jsonify === undefined) {
                jsonify = false;
            }

            if (field !== undefined && typeof field.config === 'object' && field.config[key] !== undefined) {
                if (jsonify) {
                    // Attempt to convert to json string
                    if (typeof field.config[key] === "string" && ['[', '{'].indexOf(field.config[key].substring(0, 1)) > -1) {
                        try {
                            json = $.parseJSON(field.config[key]);
                            field.config[key] = json;
                        } catch (ignore) {
                        }
                    }
                }

                return field.config[key];
            }

            return defaultVal;
        },

        /**
         * Fields optionally have a shortened label for use in summary tables/pdfs.
         * @param field
         * @returns {*}
         */
        getShortLabel = function (field) {
            return getConfig(field, 'shortLabel', '').length > 0 ? getConfig(field, 'shortLabel') : getConfig(field, 'label');
        },

        /**
         * Retrieve the credit card type from the credit card number
         * @param number
         * @returns {string}
         */
        getCreditCardType = function (number) {
            if (/^5[1-5]/.test(number)) {
                return fc.cardTypes.mastercard;
            }

            if (/^4/.test(number)) {
                return fc.cardTypes.visa;
            }

            if (/^3[47]/.test(number)) {
                return fc.cardTypes.amex;
            }

            return "";
        },

        /**
         * Send off an API call.
         * @param uri
         * @param data
         * @param type
         * @param callback
         */
        api = function (uri, data, type, callback) {
            if (type === undefined || typeof type !== 'string' || ['GET', 'POST', 'PUT'].indexOf(type.toUpperCase()) === -1) {
                type = 'GET';
            }
            type = type.toUpperCase();

            if (data === undefined) {
                data = {};
            }

            // Default session id
            if (data.sessionId === undefined) {
                data.sessionId = fc.sessionId;
            }

            // Default form id
            if (data.form_id === undefined) {
                data.form_id = fc.formId;
            }

            // Set the branch to use if defined
            if (data.branch === undefined && typeof fc.branch === 'string') {
                data.branch = fc.branch;
            }

            // Set the channel information
            if (fc.channel !== undefined && typeof fc.channel === 'string' && fc.channel.length > 0) {
                data.channel = fc.channel;
            }

            // Shoot off the ajax request
            $.ajax({
                type: type,
                url: apiUrl + uri,
                data: data,
                beforeSend: function (request) {
                    request.setRequestHeader('Authorization', 'Bearer ' + fc.publicKey);
                },
                success: function (data) {
                    if (typeof data === 'string') {
                        try {
                            data = $.parseJSON(data);
                        } catch (ignore) {
                        }
                    }
                    callback(data);
                },
                error: function (data) {
                    callback(data);
                }
            });
        },

        /**
         * Function to detect if currently mobile
         * @returns {boolean}
         */
        isMobile = function () {
            return parseInt($(window).width(), 10) < fc.config.minSizeForMobile;
        },

        /**
         * Checks whether a particular action has been processed (i.e. used for rendering actions only once)
         *
         * @param field
         * @param defaultValue
         * @returns {*}
         */
        processed = function (field, defaultValue) {
            if (defaultValue === undefined || typeof defaultValue !== "boolean") {
                defaultValue = false;
            }

            // If the value has been set, return it
            if (typeof fc.processedActions[field] === "boolean") {
                return fc.processedActions[field];
            }

            return defaultValue;
        },

        /**
         * Retrieve tags for a field
         *
         * @param field
         * @param prefix
         * @param idPrefix
         * @returns {{}}
         */
        getTags = function (field, prefix, idPrefix) {
            if (field === undefined) {
                return {};
            }

            if (prefix === undefined) {
                prefix = '';
            }

            if (idPrefix === undefined) {
                idPrefix = '';
            }

            var fieldTag = getConfig(field, 'tag', false),
                tags = {},
                grouplet,
                groupletTags,
                iterator,
                id = idPrefix;

            if (fieldTag) {
                id += getId(field);

                tags[id] = prefix + fieldTag;
                grouplet = getConfig(field, 'grouplet', false);

                if (grouplet && grouplet.field && $.isArray(grouplet.field) && grouplet.field.length > 0) {
                    for (iterator = 0; iterator < grouplet.field.length; iterator += 1) {
                        groupletTags = getTags(grouplet.field[iterator], tags[id] + fc.constants.tagSeparator, id + fc.constants.prefixSeparator);
                        if (Object.keys(groupletTags).length > 0) {
                            $.extend(tags, groupletTags);
                        }
                    }
                }
            }

            return tags;
        },

        /**
         * Retrieve the field tags
         * @returns {{}}
         */
        getFieldTags = function (reverseOrder) {
            if (reverseOrder === undefined || typeof reverseOrder !== 'boolean') {
                reverseOrder = false;
            }
            var key, fieldId, tags = {}, fieldTags, tagValues;

            for (key in fc.fieldSchema) {
                if (fc.fieldSchema.hasOwnProperty(key)) {
                    fieldTags = getTags(fc.fieldSchema[key]);
                    tagValues = {};

                    if (Object.keys(fieldTags).length > 0) {
                        for (fieldId in fieldTags) {
                            if (fieldTags.hasOwnProperty(fieldId)) {
                                if (reverseOrder) {
                                    tagValues[fieldTags[fieldId]] = fieldId;
                                } else {
                                    if (fieldTags.hasOwnProperty(fieldId) && fc.fields[fieldId] !== undefined) {
                                        tagValues[fieldId] = fieldTags[fieldId];
                                    }
                                }
                            }
                        }

                        $.extend(tags, tagValues);
                    }
                }
            }

            return tags;
        },

        /**
         * Sort fields in to an array with keys based on tags against their values
         * @returns {Array}
         */
        getFieldTagValues = function () {
            var key, fieldId, values = {}, fieldTags, tagValues;

            for (key in fc.fieldSchema) {
                if (fc.fieldSchema.hasOwnProperty(key)) {
                    fieldTags = getTags(fc.fieldSchema[key]);
                    tagValues = {};

                    if (Object.keys(fieldTags).length > 0) {
                        for (fieldId in fieldTags) {
                            if (fieldTags.hasOwnProperty(fieldId) && fc.fields[fieldId] !== undefined) {
                                tagValues[fieldTags[fieldId]] = fc.fields[fieldId];
                            }
                        }

                        $.extend(values, tagValues);
                    }
                }
            }

            return values;
        },

        /**
         * Return the value of a field element.
         * @param field
         * @returns {*}
         */
        getFieldValue = function (field) {
            var selector,
                values = [],
                dataId,
                val,
                dataValue;

            // If not defined, return nothing
            if (!field || field.length === 0) {
                return;
            }

            if (field.is('input') || field.is('textarea')) {
                if (field.attr('type') === 'radio') {
                    // Radio lists
                    if ($('input[name=' + $(field).attr('name') + ']:checked').length > 0) {
                        return $('input[name=' + $(field).attr('name') + ']:checked').val();
                    }
                    return '';
                }

                if (field.attr('type') === 'checkbox') {
                    // Checkbox lists
                    selector = $('input[formcorp-data-id=' + $(field).attr('formcorp-data-id') + ']:checked');
                    if (selector.length === 0) {
                        return '';
                    }
                    values = [];
                    selector.each(function () {
                        values.push($(this).val());
                    });
                    return JSON.stringify(values);
                }

                dataId = $(field).attr('formcorp-data-id');
                if (fc.fieldSchema[dataId] !== undefined) {
                    // If read-only, do not record a value
                    return getConfig(fc.fieldSchema[dataId], 'readOnly', false) ? '' : field.val();
                }
            }

            if (field.is('select')) {
                return $(field).find('option:selected').val();
            }

            // Return the value for rendered buttons
            if (field.is('button')) {
                dataId = field.attr('formcorp-data-id');
                if (dataId) {
                    if (!getConfig(fc.fieldSchema[dataId], 'allowMultiple', false)) {
                        dataValue = $('.fc-button.checked[formcorp-data-id="' + dataId + '"]').attr('data-field-value');
                        if (dataValue) {
                            return decodeURIComponent(dataValue);
                        }

                        // If a radio, can just get the button text
                        return $('.fc-button.checked[formcorp-data-id="' + dataId + '"]').text();
                    }

                    val = [];
                    // Otherwise if multiple are allowed, have to get all
                    $('.fc-button.checked[formcorp-data-id="' + dataId + '"]').each(function () {
                        val.push(decodeURIComponent($(this).attr('data-field-value')));
                    });

                    return val;
                }
            }

            // If a signature, set a string as the json value of the signature
            dataId = field.attr('fc-data-group');
            if ((fc.renderedSignatures !== undefined && fc.renderedSignatures[dataId] !== undefined) || field.hasClass(fc.config.signatureClass)) {
                if (dataId === undefined) {
                    // Attempt to load secondary data id if undefined (can run on parent and child element)
                    dataId = $(field).attr('formcorp-data-id');
                }

                if (fc.renderedSignatures !== undefined && fc.renderedSignatures[dataId] !== undefined) {
                    return fc.renderedSignatures[dataId].getSignatureString();
                }
            }

            return '';
        },

        /**
         * Returns true if a field is empty, false if not.
         * @param field
         * @returns {boolean}
         */
        fieldIsEmpty = function (field) {
            var value = getFieldValue(field);
            if (value === undefined) {
                return;
            }

            return !value || value.length === 0;
        },

        /**
         * Retrieve custom error validations from field.
         * @param field
         * @param value
         * @returns {Array}
         */
        getCustomErrors = function (field, value) {
            var errors = [],
                x,
                i,
                validator,
                callback,
                callbackSplit,
                error,
                type,
                callbackFunction,
                json;

            // If validators is a string (and starts with a json char to speed up), try to typecast to json
            if (typeof field.config.validators === "string" && ['[', '{'].indexOf(field.config.validators.substring(0, 1)) > -1) {
                try {
                    json = $.parseJSON(field.config.validators);
                    field.config.validators = json;
                } catch (ignore) {
                }
            }

            // If validators are set, attempt to validate
            if (typeof field.config.validators === 'object' && field.config.validators.length > 0) {
                for (x = 0; x < field.config.validators.length; x += 1) {
                    validator = field.config.validators[x];
                    type = fc.toCamelCase(validator.type);
                    callbackFunction = 'fc.validator' + type.substring(0, 1).toUpperCase() + type.substr(1);

                    // Convert string to function call
                    callback = window;
                    callbackSplit = callbackFunction.split('.');
                    for (i = 0; i < callbackSplit.length; i += 1) {
                        callback = callback[callbackSplit[i]];
                    }

                    // Call the callback function
                    if (!callback(validator.params, value)) {
                        error = typeof validator.error === 'string' && validator.error.length > 0 ? validator.error : fc.lang.defaultCustomValidationError;
                        errors.push(error);
                    }
                }
            }

            return errors;
        },

        /**
         * Returns a list of errors on a particular field.
         * @param id
         * @returns {Array}
         */
        fieldErrors = function (id) {
            var fieldSelector = $('.fc-field[fc-data-group="' + id + '"]'),
                dataId = id,
                section,
                field,
                value,
                errors = [],
                dataField,
                belongsTo,
                parentGrouplet,
                parentGroupletId,
                selector,
                mappedValue,
                domValue;

            if (fieldSelector.length === 0) {
                return [];
            }

            // If the field is hidden, not required to validate
            if (fieldSelector.hasClass('fc-hide')) {
                return [];
            }

            section = fieldSelector.parent();
            field = fc.fieldSchema[dataId];

            // If value has been mapped, use that
            if (fc.fields[dataId] !== undefined) {
                mappedValue = fc.fields[dataId];
            }

            // Fetch the value on the DOM
            domValue = getFieldValue(fieldSelector.find('.fc-fieldinput'));

            // Give higher priority to the value in the dom
            if (domValue !== undefined) {
                value = domValue;
            } else {
                value = mappedValue;
            }

            // Default value to empty string if unable to retrieve a value
            if (value === undefined || value === null) {
                value = '';
            }

            // If section is hidden, return
            if (section.hasClass('fc-hide')) {
                return [];
            }

            // If belongs to a grouplet, and the parent grouplet is hidden, do not display
            selector = fieldSelector;
            do {
                belongsTo = selector.attr('fc-belongs-to');
                parentGrouplet = $('[fc-data-group="' + belongsTo + '"],[formcorp-data-id="' + belongsTo + '"]');

                // Fetch the id
                parentGroupletId = parentGrouplet.attr('fc-data-group');
                if (parentGroupletId === undefined) {
                    parentGroupletId = parentGrouplet.attr('formcorp-data-id');
                }

                // If an id/instance is defined, check if hidden (if hidden, do not render errors)
                if (parentGroupletId !== undefined) {
                    if (parentGrouplet.hasClass('fc-hide')) {
                        return [];
                    }
                    selector = $('[fc-data-group="' + belongsTo + '"],[formcorp-data-id="' + belongsTo + '"]');
                }
            } while (parentGroupletId !== undefined);

            // If abn field, check to see if valid
            if (field.type === 'abnVerification') {
                if (fc.validAbns.indexOf(value) < 0) {
                    errors.push(fc.lang.validAbnRequired);
                    return errors;
                }
            } else {
                // Test required data
                dataField = $('[fc-data-group="' + id + '"] [data-required="true"]');
                if (getConfig(field, 'required', false) && fieldIsEmpty(dataField)) {
                    errors.push(fc.lang.emptyFieldError);
                    return errors;
                }
            }

            // Custom validators
            errors = errors.concat(getCustomErrors(field, value));

            return errors;
        },

        /**
         * Store an event locally to be logged
         * @param event
         * @param params
         */
        logEvent = function (event, params) {
            if (event === undefined) {
                return;
            }

            if (fc.analytics && fc.analytics.logEvent) {
                fc.analytics.logEvent(event, params);
            }
        },

        /**
         * Show the errors on the DOM for a given field.
         * @param dataId
         * @param errors
         */
        showFieldError = function (dataId, errors) {
            var dataGroup = $(fc.jQueryContainer).find('div[fc-data-group="' + dataId + '"]'),
                x,
                msg = '';

            // Trigger an event
            $(fc.jQueryContainer).trigger(fc.jsEvents.onFieldError, [dataId, errors]);

            dataGroup.addClass('fc-error');

            // If inline validation enabled, output error message(s)
            if (fc.config.inlineValidation === true) {
                for (x = 0; x < errors.length; x += 1) {
                    msg += errors[x] + '<br>';
                }
                dataGroup.find('.fc-error-text').html(msg);
            }
        },

        /**
         * Recursively retrieves grouplet field ids.
         * @param field
         * @returns {Array}
         */
        getGroupletFields = function (field) {
            if (field.type === "grouplet") {
                var grouplet = getConfig(field, "grouplet", {field: []}),
                    fieldIterator,
                    groupletField,
                    fields = [],
                    fieldId;

                /*jslint nomen: true*/
                fieldId = field._id.$id;
                /*jslint nomen: false*/

                for (fieldIterator = 0; fieldIterator < grouplet.field.length; fieldIterator += 1) {
                    groupletField = grouplet.field[fieldIterator];

                    // If grouplet within a groupler, need to recursively add
                    if (groupletField.type === "grouplet") {
                        fields.concat(getGroupletFields(groupletField));
                    } else {
                        /*jslint nomen: true*/
                        fields.push(fieldId + fc.constants.prefixSeparator + groupletField._id.$id);
                        /*jslint nomen: false*/
                    }
                }

                return fields;
            }

            return [];
        },

        /**
         * Returns the page id a field belongs to
         * @param fieldId
         * @returns {*}
         */
        getFieldPageId = function (fieldId) {
            if (fc.fieldPages === undefined) {
                fc.fieldPages = {};
            }

            if (fc.fieldPages[fieldId] !== undefined && typeof fc.fieldPages[fieldId] === "string") {
                return fc.fieldPages[fieldId];
            }

            var stageIterator, pageIterator, sectionIterator, fieldIterator, groupletIterator, page, section, field, groupletFields;

            for (stageIterator = 0; stageIterator < fc.schema.stage.length; stageIterator += 1) {
                for (pageIterator = 0; pageIterator < fc.schema.stage[stageIterator].page.length; pageIterator += 1) {
                    page = fc.schema.stage[stageIterator].page[pageIterator];
                    for (sectionIterator = 0; sectionIterator < page.section.length; sectionIterator += 1) {
                        if (typeof page.section[sectionIterator].field !== "object") {
                            continue;
                        }
                        section = page.section[sectionIterator];

                        for (fieldIterator = 0; fieldIterator < section.field.length; fieldIterator += 1) {
                            field = section.field[fieldIterator];
                            /*jslint nomen: true*/
                            fc.fieldPages[field._id.$id] = page._id.$id;
                            /*jslint nomen: false*/

                            // If field is a grouplet, need to get grouplet fields
                            if (field.type === "grouplet") {
                                groupletFields = getGroupletFields(field);
                                for (groupletIterator = 0; groupletIterator < groupletFields.length; groupletIterator += 1) {
                                    /*jslint nomen: true*/
                                    fc.fieldPages[groupletFields[groupletIterator]] = page._id.$id;
                                    /*jslint nomen: false*/
                                }
                            }
                        }
                    }
                }
            }

            if (fc.fieldPages[fieldId] !== undefined && typeof fc.fieldPages[fieldId] === "string") {
                return fc.fieldPages[fieldId];
            }

            return "";
        },

        /**
         * Returns a field by tag
         * @param tag
         * @returns {*}
         */
        getFieldByTag = function (tag) {
            var iterator, fieldTag;

            for (iterator in fc.fieldSchema) {
                if (fc.fieldSchema.hasOwnProperty(iterator)) {
                    fieldTag = getConfig(fc.fieldSchema[iterator], 'tag', '');
                    if (fieldTag.length > 0 && fieldTag === tag) {
                        return fc.fieldSchema[iterator];
                    }
                }
            }
        },

        /**
         * Remove the error on the DOM for a given field.
         * @param dataId
         */
        removeFieldError = function (dataId) {
            $(fc.jQueryContainer).trigger(fc.jsEvents.onFieldSuccess, [dataId]);
            $(fc.jQueryContainer).find('div[fc-data-group="' + dataId + '"]').removeClass('fc-error');
        },

        /**
         * 'god' fields do not require a value (i.e. rich text area)
         * @type {string[]}
         */
        godFields = ["richTextArea"],

        /**
         * Performs a simple check using the Luhn algorithm to determine if a credit card number is valid.
         * @param val
         * @returns {boolean}
         */
        luhnCheck = function (val) {
            var sum = 0, iterator, intVal;

            for (iterator = 0; iterator < val.length; iterator += 1) {
                intVal = parseInt(val.substr(iterator, 1), 10);
                if (iterator % 2 === 0) {
                    intVal *= 2;
                    if (intVal > 9) {
                        intVal = 1 + (intVal % 10);
                    }
                }
                sum += intVal;
            }
            return (sum % 10) === 0;
        },

        /**
         * Validate a credit card field
         * @param dataId
         * @param field
         * @param section
         * @returns {Array}
         */
        validCreditCardField = function (dataId, field, section) {
            var value = fc.fields[dataId] === undefined ? '' : fc.fields[dataId],
                errors = [],
                ccForm,
                cardName,
                cardNumber,
                expiryMonth,
                expiryYear,
                securityCode;

            // A value for the credit card indicates its all good (to be verified by server)
            if (value.length > 0) {
                return [];
            }

            // Fetch the cc form
            ccForm = $(fc.jQueryContainer).find('[fc-data-group="' + dataId + '"]');
            if (ccForm.length === 0) {
                console.log("[FC] Unable to locate CC form");
                return [];
            }

            // Map values to js variables
            cardName = ccForm.find('.fc-cc-name input');
            cardNumber = ccForm.find('.fc-cc-number input');
            expiryMonth = parseInt(ccForm.find('.fc-cc-expirydate option:selected').val(), 0);
            expiryYear = parseInt(ccForm.find('.fc-cc-expirydate-year option:selected').val(), 0);
            securityCode = ccForm.find('.fc-cc-ccv input');

            // Validate credit card name
            if (cardName.val().length === 0) {
                errors.push(fc.lang.creditCardMissingName);
            }

            // Validate credit card number
            cardNumber = cardNumber.val().replace(/[^0-9]/g, "", cardNumber);
            if (cardNumber.length === 0) {
                // Ensure a value was entered
                errors.push(fc.lang.creditCardMissingNumber);
            } else if (cardNumber.length < fc.config.creditCardNumberLimits[0] || cardNumber.length > fc.config.creditCardNumberLimits[1] || !luhnCheck(cardNumber)) {
                // Ensure the value was the correct limit
                errors.push(fc.lang.invalidCardFormat);
            }

            // Expiry - ensure values entered
            if (expiryMonth === undefined || expiryMonth.length === 0 || expiryYear === undefined || expiryYear.length === 0 || isNaN(expiryMonth) || isNaN(expiryYear)) {
                errors.push(fc.lang.creditCardMissingExpiryDate);
            } else if (expiryMonth < 1 || expiryMonth > 12) {
                // Check month within range 1 <= month <= 12
                errors.push(fc.lang.creditCardMissingExpiryDate);
            } else if (expiryYear < (new Date()).getFullYear() || expiryYear > ((new Date()).getFullYear() + 30)) {
                // Check year within range CURRENT_YEAR <= year <= (CURRENT_YEAR + 30)
                errors.push(fc.lang.creditCardMissingExpiryDate);
            } else if (expiryYear === (new Date()).getFullYear() && expiryMonth < ((new Date()).getMonth() + 1)) {
                errors.push(fc.lang.creditCardExpired);
            }

            // Validate security code - min and max length
            securityCode = securityCode.val().replace(/[^0-9]/g, "", securityCode);
            if (securityCode.length === 0 || securityCode.length > fc.config.maxCreditCardCodeLength) {
                errors.push(fc.lang.creditCardMissingSecurityCode);
            }

            return errors;
        },

        /**
         * Returns true if a field element exists within a modal window
         * @param obj
         * @returns {boolean}
         */
        inModal = function (obj) {
            return obj.parent().parent().parent().parent().attr("class").indexOf("fc-repeatable-container") > -1;
        },

        /**
         * Check the validity of the entire form.
         * @param rootElement
         * @returns {boolean}
         */
        validForm = function (rootElement, showErrors) {
            var errors = {},
                required;

            if (rootElement === undefined) {
                rootElement = fc.jQueryContainer;
            }

            // Whether to update the DOM with the errors or just return a bool
            if (typeof showErrors !== "boolean") {
                showErrors = true;
            }

            // Test if required fields have a value
            $(rootElement).find('.fc-field[fc-data-group]').each(function () {
                // If a repeatable field, ignore
                if ($(this).parent().attr("class").indexOf("repeatable") > -1) {
                    return;
                }

                // If the field is hidden, not required to validate
                if ($(this).hasClass('fc-hide')) {
                    return;
                }

                // If in modal, do nothing
                if (inModal($(this))) {
                    return;
                }

                var dataId = $(this).attr('fc-data-group'),
                    section = $(this).parent(),
                    field = fc.fieldSchema[dataId],
                    value = fc.fields[dataId] === undefined ? '' : fc.fields[dataId],
                    localErrors = [],
                    skipCheck = false;

                // If not required, do nothing
                if (getConfig(field, 'required', false) === false || getConfig(field, 'readOnly', false)) {
                    return;
                }

                // Check if the field requires a value
                if (typeof field.type === 'string' && godFields.indexOf(field.type) !== -1) {
                    return;
                }

                // If section is hidden, return
                if (section.hasClass('fc-hide')) {
                    return;
                }

                // If a credit card payment field, treat uniquely
                if (field.type === "creditCard") {
                    if (value.length === 0) {
                        localErrors.push(fc.lang.paymentRequired);
                    }
                    skipCheck = true;
                } else if (["emailVerification", "smsVerification"].indexOf(field.type) > -1) {
                    // If email or sms verification, check if verified
                    if (fc.fields[getId(field)] === undefined || fc.fields[getId(field)] !== '1') {
                        localErrors.push(fc.lang.fieldMustBeVerified);
                    } else {
                        // Successfully verified
                        skipCheck = true;
                    }
                } else if (field.type === "signature") {
                    // Signature fields need to be uniquely validated
                    if (fc.renderedSignatures === undefined || fc.renderedSignatures[dataId] === undefined) {
                        // Signature hasn't been initialised
                        localErrors.push("Field has not been initialised");
                    } else {
                        if (fc.renderedSignatures[dataId].validateForm() === false) {
                            // Attempt to validate the field
                            localErrors.push(fc.lang.emptyFieldError);
                        } else {
                            // Store the value
                            fc.fields[dataId] = fc.renderedSignatures[dataId].getSignatureString();
                        }
                    }
                    skipCheck = true;

                } else if (field.type === "grouplet") {
                    // Grouplet field as a whole doesn't need to be validated
                    return;
                }

                // If repeatable and required, check the amount of values
                if (!skipCheck && localErrors.length === 0) {
                    if (field.config !== undefined && typeof field.config.repeatable === 'boolean' && field.config.repeatable) {
                        required = $(this).attr('data-required');
                        if (required === 'true' && (typeof value !== 'object' || value.length === 0)) {
                            localErrors.push(fc.lang.emptyFieldError);
                        }
                    } else {
                        localErrors = fieldErrors(dataId);
                    }
                }

                // If have errors, output
                if (localErrors.length > 0) {
                    // Log error event
                    logEvent(fc.eventTypes.onFieldError, {
                        fieldId: dataId,
                        errors: localErrors
                    });

                    errors[dataId] = localErrors;
                    if (showErrors) {
                        showFieldError(dataId, localErrors);
                    }
                } else {
                    if (showErrors) {
                        removeFieldError(dataId);
                    }
                }
            });

            return Object.keys(errors).length === 0;
        },

        /**
         * Finds and returns a page by its id.
         * @param pageId
         * @returns {*}
         */
        getPageById = function (pageId) {
            if (typeof fc.pages[pageId] === 'object') {
                return fc.pages[pageId];
            }

            var x,
                y,
                stage,
                page;
            for (x = 0; x < fc.schema.stage.length; x += 1) {
                stage = fc.schema.stage[x];
                if (typeof stage.page === 'object' && stage.page.length > 0) {
                    for (y = 0; y < stage.page.length; y += 1) {
                        page = stage.page[y];
                        /*jslint nomen: true*/
                        if (fc.pages[page._id.$id] === undefined) {
                            fc.pages[page._id.$id] = {
                                stage: stage,
                                page: page
                            };
                        }
                        /*jslint nomen: false*/
                    }
                }
            }

            if (fc.pages[pageId]) {
                return fc.pages[pageId];
            }
        },

        /**
         * Creates a dictionary of values for a grouplet against the original id.
         *
         * @param key
         * @param value
         */
        saveOriginalGroupletValue = function (key, value) {
            var parts, groupletId, fieldId;

            if (key.indexOf(fc.constants.prefixSeparator) > -1) {
                parts = key.split(fc.constants.prefixSeparator);
                if (parts.length > 1) {
                    // Retrieve the grouplet id second from the end
                    groupletId = parts[parts.length - 2];
                    fieldId = parts[parts.length - 1];

                    if (fc.fields[groupletId] === undefined) {
                        fc.fields[groupletId] = {};
                    }
                    fc.fields[groupletId][fieldId] = value;
                }
            }
        },

        /**
         * Converts an object to a literal boolean object string.
         * @param obj
         * @returns {*}
         */
        toBooleanLogic = function (obj) {
            var condition = '',
                x,
                rule,
                comparison,
                compare = '',
                json,
                comparisonCondition;

            if (!obj) {
                return;
            }

            // If its a string, attempt to convert to json and return
            if (typeof obj === "string") {
                if (obj.isJson()) {
                    return toBooleanLogic($.parseJSON(obj));
                }

                // Assume already boolean logic
                return obj;
            }

            if (obj.condition !== undefined) {
                compare = obj.condition.toLowerCase() === 'and' ? ' && ' : ' || ';
            }

            if (typeof obj.rules === 'object') {
                condition += '(';
                for (x = 0; x < obj.rules.length; x += 1) {
                    rule = obj.rules[x];

                    if (rule.condition !== undefined) {
                        comparisonCondition = rule.condition.toLowerCase() === 'and' ? ' && ' : ' || ';
                    } else {
                        comparisonCondition = compare;
                    }

                    // Optimise the AND/OR clause
                    if (comparisonCondition === 0) {
                        // Default to AND condition
                        comparisonCondition = ' && ';
                    }
                    if (x === 0) {
                        comparisonCondition = '';
                    }

                    // If have a comparison, add it to our condition string
                    if (typeof rule.field === 'string' && rule.value !== undefined) {
                        // Comparison function to call
                        comparison = 'fc.comparison';
                        if (typeof rule.operator === 'string' && rule.operator.length > 0) {
                            comparison += rule.operator.charAt(0).toUpperCase() + rule.operator.slice(1);
                        }

                        // Attempt to typecast to object from string
                        if (typeof rule.value === 'string' && ['[', '{'].indexOf(rule.value.substring(0, 1)) > -1) {
                            try {
                                json = $.parseJSON(rule.value);
                                rule.value = json;
                            } catch (ignore) {
                            }
                        }

                        // If object, cast to JSON string
                        if (typeof rule.value === 'object') {
                            rule.value = JSON.stringify(rule.value);
                        } else if (typeof rule.value === 'string') {
                            rule.value = '"' + rule.value + '"';
                        }

                        condition += comparisonCondition + comparison + '(fc.fields["' + rule.field + '"], ' + rule.value + ', "' + rule.field + '")';
                    }

                    // If have nested rules, call recursively
                    if (typeof rule.rules === 'object' && rule.rules.length > 0) {
                        condition += (x > 0 ? compare : '') + toBooleanLogic(rule);
                    }
                }
                condition += ')';
            }

            return condition;
        },

        /**
         * Update schema definitions for a set of fields
         * @param fields
         */
        updateFieldSchemas = function (fields) {
            var iterator, field, id, a, jsonDecode = ['visibility', 'validators'], toBoolean = ['visibility'], grouplet;

            for (iterator = 0; iterator < fields.length; iterator += 1) {
                field = fields[iterator];
                /*jslint nomen: true*/
                id = field._id.$id;
                /*jslint nomen: false*/

                // Add t field schema if doesn't already exist
                if (fc.fieldSchema[id] === undefined) {
                    // Decode configuration strings to json objects as required
                    for (a = 0; a < jsonDecode.length; a += 1) {
                        if (field.config[jsonDecode[a]] !== undefined && field.config[jsonDecode[a]].length > 0) {
                            field.config[jsonDecode[a]] = $.parseJSON(field.config[jsonDecode[a]]);

                            // Whether or not the object needs to be converted to boolean logic
                            if (toBoolean.indexOf(jsonDecode[a]) >= 0) {
                                field.config[jsonDecode[a]] = toBooleanLogic(field.config[jsonDecode[a]], true);
                            }
                        }
                    }

                    fc.fieldSchema[id] = field;
                }

                // If the field is a grouplet, need to recursively update the field schema
                if (field.type === "grouplet") {
                    grouplet = getConfig(field, 'grouplet', {field: []});
                    updateFieldSchemas(grouplet.field);
                }
            }
        },

        /**
         * Initialise data analytics
         */
        initAnalytics = function () {
            $(fc.jQueryContainer).on(fc.jsEvents.onAnalyticsLoaded, function () {
                fc.analytics = fcAnalytics;
                fc.analytics.init();
            });
            loadJsFile(analyticsUrl);
        },

        /**
         * Update field schema (object stores the configuration of each field for easy access)
         * @param stage
         */
        updateFieldSchema = function (stage) {
            var jsonDecode = ['visibility', 'validators'],
                toBoolean = ['visibility'],
                x,
                y,
                key,
                page,
                section,
                a;

            if (stage.page !== undefined) {
                // Iterate through each page
                for (x = 0; x < stage.page.length; x += 1) {
                    page = stage.page[x];
                    if (page.section === undefined) {
                        continue;
                    }

                    // Convert page to conditions to JS boolean logic
                    if (typeof page.toCondition === 'object' && Object.keys(page.toCondition).length > 0) {
                        for (key in page.toCondition) {
                            if (page.toCondition.hasOwnProperty(key)) {
                                try {
                                    page.toCondition[key] = toBooleanLogic($.parseJSON(page.toCondition[key]));
                                } catch (ignore) {
                                }
                            }
                        }
                    }

                    // Iterate through each section
                    for (y = 0; y < page.section.length; y += 1) {
                        section = page.section[y];
                        if (section.field === undefined || section.field.length === 0) {
                            continue;
                        }

                        // Are any object keys required to be decoded to a json object?
                        for (a = 0; a < jsonDecode.length; a += 1) {
                            if (typeof section[jsonDecode[a]] === 'string') {
                                try {
                                    section[jsonDecode[a]] = $.parseJSON(section[jsonDecode[a]]);
                                } catch (ignore) {
                                }
                            }
                        }

                        // Are any object keys required to be converted to boolean logic?
                        for (a = 0; a < toBoolean.length; a += 1) {
                            if (typeof section[toBoolean[a]] === 'object') {
                                section[toBoolean[a]] = toBooleanLogic(section[toBoolean[a]]);
                            }
                        }

                        // Append to object sections dictionary
                        /*jslint nomen: true*/
                        if (fc.sections[section._id.$id] === undefined) {
                            fc.sections[section._id.$id] = section;
                        }
                        /*jslint nomen: false*/

                        // Iterate through each field
                        updateFieldSchemas(section.field);
                    }
                }
            }
        },

        /**
         * Retrieves list of tags from a grouplet (used for templating)
         * @param fieldId
         * @returns {*}
         */
        getGroupletTags = function (fieldId) {
            var schema = fc.fieldSchema[fieldId],
                field,
                tags = {},
                counter,
                localField,
                tag;

            if (schema === undefined || schema.type !== "grouplet") {
                return [];
            }

            // Iterate through each field in the grouplet, if it has a tag, append to dict
            field = getConfig(schema, "grouplet");
            if (typeof field === "object" && field.field !== undefined && field.field.length > 0) {
                for (counter = 0; counter < field.field.length; counter += 1) {
                    localField = field.field[counter];
                    tag = getConfig(localField, "tag", "");
                    if (tag.length > 0) {
                        /*jslint nomen: true*/
                        tags[localField._id.$id] = tag;
                        /*jslint nomen: false*/
                    }
                }
            }

            return tags;
        },

        /**
         * Returns an array of values next to field's associated tags. Used for templating.
         *
         * @param row
         * @param tags
         * @returns {*}
         */
        getGroupletRowTags = function (row, tags) {
            var key, fieldIdParts, fieldId, vals = {};
            if (typeof row === "object") {
                for (key in row) {
                    if (row.hasOwnProperty(key)) {
                        // If the id is prefixed (i.e. grouplet-id_field-id), retrieve the field id
                        if (key.indexOf(fc.constants.prefixSeparator) > -1) {
                            fieldIdParts = key.split(fc.constants.prefixSeparator);
                            fieldId = fieldIdParts[fieldIdParts.length - 1];
                        } else {
                            fieldId = key;
                        }

                        // If a tag exists, add it
                        if (tags.hasOwnProperty(fieldId)) {
                            vals[tags[fieldId]] = row[key];
                        } else {
                            // Otherwise default to the field id
                            vals[fieldId] = row[key];
                        }
                    }
                }
            }

            return vals;
        },

        /**
         * Scroll to an offset on the screen
         * @param offset
         */
        scrollToOffset = function (offset) {
            // If already scrolling, do nothing
            if (fc.midScroll !== undefined && fc.midScroll === true) {
                return;
            }

            fc.midScroll = true;

            $('html,body').animate({
                scrollTop: offset + "px"
            }, fc.config.scrollDuration, function () {
                fc.midScroll = false;
                fc.activeScroll = "";
            });
        },

        /**
         * Replace tokens with their value, for templating
         * @param layout
         * @param tokens
         * @returns {*}
         */
        replaceTokens = function (layout, tokens) {
            var replacements = layout.match(/\{\{([^\}]{0,})\}\}/g),
                replacement,
                token,
                index,
                re;

            for (index = 0; index < replacements.length; index += 1) {
                replacement = replacements[index];
                token = replacement.replace(/[\{\}]/g, "");
                re = new RegExp('\\{\\{' + token + '\\}\\}', "gi");

                // If the token exists, perform the replacement, else set to empty
                if (tokens.hasOwnProperty(token)) {
                    layout = layout.replace(re, tokens[token]);
                } else {
                    layout = layout.replace(re, "");
                }
            }

            return layout;
        },

        /**
         * Replace tokens within a DOM element
         *
         * @param el
         * @param data
         * @returns {*}
         */
        replaceTokensInDom = function (el, data) {
            if (data === undefined || data === false) {
                data = getFieldTagValues();
            }

            if (el === undefined) {
                el = $(fc.jQueryContainer);
            }

            // Perform token replacements
            el.find('span.fc-token').each(function () {
                var dataToken = $(this).attr('data-token');
                if (dataToken && dataToken.length > 0 && data[dataToken] !== undefined) {
                    $(this).html(htmlEncode(data[dataToken]));
                }
            });

            return el;
        },

        /**
         * Retrieve the payment amount for a credit card field, based on the default and conditional parameters
         *
         * @param fieldId
         * @returns {*}
         */
        getPaymentAmount = function (fieldId) {
            var schema, price, conditionalPrices, booleanLogic, conditionalPrice, iterator;

            // Retrieve the field schema
            schema = fc.fieldSchema[fieldId];
            if (schema === undefined) {
                return;
            }

            // Use the default price initially
            price = getConfig(schema, 'defaultPrice', 0);

            // Check to see if conditional prices were supplied and, if so iterate through them
            conditionalPrices = getConfig(schema, 'conditionalPrice', [], true);
            if (typeof conditionalPrices === "object" && conditionalPrices.length > 0) {
                for (iterator = 0; iterator < conditionalPrices.length; iterator += 1) {
                    conditionalPrice = conditionalPrices[iterator];

                    // If conditions passed through, check if true
                    if (typeof conditionalPrice.conditions === "object") {
                        booleanLogic = toBooleanLogic(conditionalPrice.conditions);
                        if (eval(booleanLogic)) {
                            price = conditionalPrice.price;
                        }
                    }
                }
            }

            return price;
        },

        /**
         * Renders a repeatable table
         * @param fieldId
         * @param rows
         * @returns {string}
         */
        renderRepeatableTable = function (fieldId, rows) {
            var html = '',
                index,
                tags = getGroupletTags(fieldId),
                field = fc.fieldSchema[fieldId],
                layout = getConfig(field, fc.constants.configKeys.summaryLayout, "");

            // Requires a summary layout to work
            if (layout.length === 0) {
                return "";
            }

            // Start the html output
            html += "<div class='fc-summary-table'>";
            html += "<table class='fc-summary'><tbody>";

            // Iterate through and render each row
            for (index = 0; index < rows.length; index += 1) {
                html += "<tr><td>";
                html += replaceTokens(layout, getGroupletRowTags(rows[index], tags));
                html += "<div class='fc-summary-options' data-field-id='" + fieldId + "' data-index='" + index + "'><a href='#' class='fc-edit'>" + fc.lang.edit + "</a> &nbsp; <a href='#' class='fc-delete'>" + fc.lang.delete + "</a></div>";
                html += "</td></tr>";
            }
            html += "</tbody></table>";

            html += '</div>';
            return html;
        },

        /**
         * Returns true if a field is repeatable.
         *
         * @param dataId
         * @returns {*|boolean}
         */
        fieldIsRepeatable = function (dataId) {
            var fieldSchema = fc.fieldSchema[dataId];

            return fieldSchema && typeof fieldSchema.config.repeatable === 'boolean' && fieldSchema.config.repeatable;
        },

        /**
         * Returns true if a field's parent is repeatable
         *
         * @param dataId
         * @returns {boolean}
         */
        fieldParentIsRepeatable = function (dataId) {
            var parts, parentId;

            parts = dataId.split(fc.constants.prefixSeparator);
            parts.pop();

            // If no parent, return false
            if (parts.length === 0) {
                return false;
            }

            parentId = parts.join(fc.constants.prefixSeparator);

            // If no schema exists for the parent, return false
            if (!fc.fieldSchema[parentId]) {
                return false;
            }

            return fieldIsRepeatable(parentId);
        },

        /**
         * Set a value in the DOM
         *
         * @param obj
         * @param value
         */
        setDomValue = function (obj, value) {
            var fieldGroup = $(obj).find('.fc-fieldgroup'),
                selector;

            if (fieldGroup.find('input[type=text],textarea').length > 0) {
                // Input type text
                fieldGroup.find('input[type=text],textarea').val(value);
            } else if (fieldGroup.find('select').length > 0) {
                // Select box
                fieldGroup.find('select').val(value);
            } else if (fieldGroup.find('input[type=radio]').length > 0) {
                // Radio options
                fieldGroup.find('input[value="' + value + '"]').prop('checked', true);
            } else {
                // Set the button
                selector = fieldGroup.find('.fc-fieldinput.fc-button[data-value="' + encodeURIComponent(value) + '"]');
                if (selector.length > 0) {
                    selector.addClass('checked');
                }
            }
        },

        /**
         * Set a field in the DOM with value stored in member object
         * @param obj
         * @param fieldId
         */
        setFieldValue = function (obj, fieldId) {
            var value,
                schema,
                iterator,
                el;

            if (fc.fields[fieldId] !== undefined) {
                value = fc.fields[fieldId];
                schema = fc.fieldSchema[fieldId];

                // If read-only and a default value set, use it
                if (getConfig(schema, 'readOnly', false)) {
                    value = getConfig(schema, 'defaultValue', '');
                }

                if (schema.type === 'grouplet' && !fieldIsRepeatable(fieldId)) {
                    console.log('restore grouplet that isnt repeatable');
                } else if (fieldIsRepeatable(fieldId)) {
                    // Restore a repeatable value
                    if (typeof value === 'object') {
                        $('[fc-data-group="' + fieldId + '"] .fc-summary').html(renderRepeatableTable(fieldId, value));
                    }
                } else if (schema.type === 'contentRadioList') {
                    if (typeof value === 'object') {
                        // Checkbox list allows multiple selections
                        for (iterator = 0; iterator < value.length; iterator += 1) {
                            el = $('.fc-button[data-field-value="' + encodeURIComponent(value[iterator]) + '"]');
                            if (el && el.length > 0) {
                                el.addClass('checked');
                            }
                        }
                    } else {
                        // Radio list allows only one selection
                        el = $('.fc-button[data-field-value="' + encodeURIComponent(value) + '"]');
                        if (el && el.length > 0) {
                            el.addClass('checked');
                        }
                    }
                } else {
                    // Otherwise set standard value in the DOM
                    setDomValue(obj, value);
                }
            }
        },

        /**
         * Set values on DOM from fields in JS
         */
        setFieldValues = function () {
            var fieldId;

            $('div[fc-data-group]').each(function () {
                fieldId = $(this).attr('fc-data-group');
                setFieldValue(this, fieldId);
            });
        },

        /**
         * Render a text field.
         * @param field
         * @returns {string}
         */
        renderTextfield = function (field, prefix) {
            if (prefix === undefined) {
                prefix = "";
            }

            /*jslint nomen: true*/
            var required = typeof field.config.required === 'boolean' ? field.config.required : false,
                fieldId = prefix + field._id.$id,
                html = '<input class="fc-fieldinput" type="text" formcorp-data-id="' + fieldId + '" data-required="' + required + '" placeholder="' + getConfig(field, 'placeholder') + '">';
            /*jslint nomen: false*/
            return html;
        },

        /**
         * Render a dropdown field.
         * @param field
         * @returns {string}
         */
        renderDropdown = function (field, prefix) {
            if (prefix === undefined) {
                prefix = "";
            }

            /*jslint nomen: true*/
            var required = typeof field.config.required === 'boolean' ? field.config.required : false,
                fieldId = prefix + field._id.$id,
                html = '<select class="fc-fieldinput" formcorp-data-id="' + fieldId + '" data-required="' + required + '">',
                options = getConfig(field, 'options', ''),
                optGroupOpen = false,
                x,
                option,
                label;
            /*jslint nomen: false*/

            if (getConfig(field, 'placeholder', '').length > 0) {
                html += '<option value="" disabled selected>' + htmlEncode(getConfig(field, 'placeholder')) + '</option>';
            }

            if (options.length > 0) {
                options = options.split("\n");
                for (x = 0; x < options.length; x += 1) {
                    option = options[x];
                    option = option.replace(/(\r\n|\n|\r)/gm, "");
                    if (option.match(/^\[\[(.*?)\]\]$/g)) {
                        // Opt group tag
                        if (optGroupOpen) {
                            html += "</optgroup>";
                        }
                        label = option.substring(2, option.length - 2);
                        html += '<optgroup label="' + label + '">';
                    } else {
                        // Normal option tag
                        html += '<option value="' + htmlEncode(option) + '">' + htmlEncode(option) + '</option>';
                    }
                }

                if (optGroupOpen) {
                    html += '</optgroup>';
                }
            }

            html += '</select>';
            return html;
        },

        /**
         * Render a text area field.
         * @param field
         * @returns {string}
         */
        renderTextarea = function (field, prefix) {
            if (prefix === undefined) {
                prefix = "";
            }
            var required = typeof field.config.required === 'boolean' ? field.config.required : false,
                fieldId = prefix + getId(field),
                html,
                value;

            // Default value
            value = getConfig(field, 'defaultValue', '').length > 0 ? getConfig(field, 'defaultValue') : '';
            html = '<textarea';

            // Whether or not the field is read only
            if (getConfig(field, 'readOnly', false)) {
                html += ' readonly';
            }

            html += ' class="fc-fieldinput" formcorp-data-id="' + fieldId + '" data-required="' + required + '" placeholder="' + getConfig(field, 'placeholder') + '" rows="' + getConfig(field, 'rows', 3) + '">' + htmlEncode(value) + '</textarea>';
            return html;
        },

        /**
         * Render the content radio list
         * @param field
         * @param prefix
         * @returns {string}
         */
        renderContentRadioList = function (field, prefix) {
            if (!prefix) {
                prefix = '';
            }

            /*jslint nomen: true*/
            var required = typeof field.config.required === 'boolean' ? field.config.required : false,
                options = getConfig(field, 'options', ''),
                fieldId = prefix + field._id.$id,
                html = '',
                x,
                cssClass,
                option,
                checked,
                json,
                value,
                description,
                help,
                icon;
            /*jslint nomen: false*/

            if (options.length > 0) {
                options = options.split("\n");
                cssClass = getConfig(field, 'inline', false) === true ? 'fc-inline' : 'fc-block';

                html += '<div class="fc-col-' + htmlEncode(getConfig(field, 'boxesPerRow')) + '">';

                // Display as buttons
                for (x = 0; x < options.length; x += 1) {
                    option = options[x].replace(/(\r\n|\n|\r)/gm, "");

                    // Decode to a json object literal
                    description = "";
                    help = "";
                    value = "";
                    icon = "";
                    json = $.parseJSON(option);

                    // Map to local variables
                    try {
                        value = json[0] || "";
                        description = json[1] || "";
                        icon = json[2] || "";
                        help = json[3] || "";
                    } catch (ignore) {
                    }
                    checked = getConfig(field, 'default') === option ? ' checked' : '';

                    html += '<div class="fc-content-radio-item fc-col">';
                    html += '<div class="fc-content-title">' + htmlEncode(value) + '</div>'; //!fc-content-title
                    html += '<div class="fc-content-content">';
                    html += '<div class="fc-content-desc">' + description + '</div>'; //!fc-content-desc
                    html += '<div class="fc-content-icon"><i class="' + htmlEncode(icon) + '"></i></div>'; //!fc-content-icon
                    html += '<div class="fc-option-buttons ' + cssClass + '">';
                    html += '<button class="fc-fieldinput fc-button" id="' + getId(field) + '_' + x + '" formcorp-data-id="' + fieldId + '" data-value="' + encodeURIComponent(option) + '" data-field-value="' + encodeURIComponent(value) + '" data-required="' + required + '"' + checked + '>' + htmlEncode(getConfig(field, 'buttonText')) + '</button>';

                    if (!fc.config.helpAsModal && help && help.length > 0) {
                        html += '<div class="fc-help">';
                        html += help;
                        html += '</div>';
                    }

                    html += '</div>'; // !fc-content-content
                    html += '</div>'; //!fc-option-buttons
                    html += '</div>'; //!fc-content-radio-item
                }

                html += '</div>'; //!fc-col-x
            }

            return html;
        },

        /**
         * Render an option table
         *
         * @param field
         * @param prefix
         * @returns {string}
         */
        renderOptionTable = function (field, prefix) {
            /*jslint nomen: true*/
            var required = typeof field.config.required === 'boolean' ? field.config.required : false,
                definition = getConfig(field, 'jsonOptions', '[]'),
                fieldId = prefix + field._id.$id,
                checked,
                html = '',
                rowIterator,
                columnIterator,
                row,
                col;
            /*jslint nomen: false*/

            // Attempt to decode to JSON object
            if (typeof definition === 'string') {
                definition = $.parseJSON(definition);
            }

            if (!definition || !definition.rows) {
                return '';
            }

            html += '<table class="fc-table"';
            if (definition.cellspacing) {
                html += ' cellspacing="' + htmlEncode(definition.cellspacing) + '"';
            }

            if (definition.cellpadding) {
                html += ' cellpadding="' + htmlEncode(definition.cellpadding) + '"';
            }
            html += '>';

            // Iterate through and output the rows
            for (rowIterator = 0; rowIterator < definition.rows.length; rowIterator += 1) {
                row = definition.rows[rowIterator];
                html += '<tr>';

                if (typeof row === 'object' && row.length > 0) {
                    for (columnIterator = 0; columnIterator < row.length; columnIterator += 1) {
                        col = row[columnIterator];

                        // Th or td element?
                        html += col.head ? '<th' : '<td';

                        // Append class as required
                        if (col.class && col.class.length > 0) {
                            html += ' class="' + htmlEncode(col.class) + '"';
                        }

                        // Colspan
                        if (col.colspan) {
                            html += 'colspan="' + htmlEncode(col.colspan) + '"';
                        }

                        html += '>';

                        // Append label
                        if (col.label) {
                            html += '<span class="fc-table-label">' + col.label + '</span>';
                        }

                        // Render option button
                        if (col.option) {
                            checked = getConfig(field, 'default') === col.option.value ? ' checked' : '';

                            html += '<div class="fc-option-buttons">';
                            html += '<button class="fc-fieldinput fc-button" id="' + getId(field) + '_' + rowIterator + '_' + columnIterator + '" formcorp-data-id="' + fieldId + '" data-value="' + encodeURIComponent(col.option.value) + '" data-field-value="' + encodeURIComponent(col.option.value) + '" data-required="' + required + '"' + checked + '>' + htmlEncode(col.option.text) + '</button>';
                            html += '</div>';
                        }

                        html += col.head ? '</th>' : '</td>';
                    }
                }

                html += '</tr>';
            }

            html += '</table>';

            return html;
        },

        /**
         * Render a radio list.
         * @param field
         * @returns {string}
         */
        renderRadioList = function (field, prefix) {
            if (prefix === undefined) {
                prefix = "";
            }

            /*jslint nomen: true*/
            var required = typeof field.config.required === 'boolean' ? field.config.required : false,
                options = getConfig(field, 'options', ''),
                fieldId = prefix + field._id.$id,
                html = '',
                x,
                cssClass,
                option,
                id,
                checked;
            /*jslint nomen: false*/

            if (options.length > 0) {
                options = options.split("\n");
                cssClass = getConfig(field, 'inline', false) === true ? 'fc-inline' : 'fc-block';

                if (getConfig(field, 'asButton', false)) {
                    html += '<div class="fc-radio-option-buttons">';

                    // Display as buttons
                    for (x = 0; x < options.length; x += 1) {
                        option = options[x].replace(/(\r\n|\n|\r)/gm, "");

                        checked = getConfig(field, 'default') === option ? ' checked' : '';

                        html += '<div class="fc-option-buttons ' + cssClass + '">';
                        html += '<button class="fc-fieldinput fc-button" id="' + getId(field) + '_' + x + '" formcorp-data-id="' + fieldId + '" data-value="' + encodeURIComponent(option) + '" data-required="' + required + '"' + checked + '>' + htmlEncode(option) + '</button>';
                        html += '</div>';
                    }
                    html += '</div>';

                } else {
                    // Display as standard radio buttons

                    for (x = 0; x < options.length; x += 1) {
                        option = options[x].replace(/(\r\n|\n|\r)/gm, "");
                        /*jslint nomen: true*/
                        id = field._id.$id + '_' + x;
                        /*jslint nomen: false*/
                        checked = getConfig(field, 'default') === option ? ' checked' : '';

                        html += '<div class="' + cssClass + '">';
                        html += '<input class="fc-fieldinput" type="radio" id="' + id + '" formcorp-data-id="' + fieldId + '" name="' + fieldId + '" value="' + htmlEncode(option) + '" data-required="' + required + '"' + checked + '>';
                        html += '<label for="' + id + '">' + htmlEncode(option) + '</label>';
                        html += '</div>';
                    }
                }
            }

            return html;
        },

        /**
         * Render a checkbox list.
         * @param field
         * @returns {string}
         */
        renderCheckboxList = function (field, prefix) {
            if (prefix === undefined) {
                prefix = "";
            }

            /*jslint nomen: true*/
            var required = typeof field.config.required === 'boolean' ? field.config.required : false,
                options = getConfig(field, 'options', ''),
                fieldId = prefix + field._id.$id,
                html = '',
                cssClass,
                x,
                option,
                id,
                json,
                savedValues = [];
            /*jslint nomen: false*/

            // Create an array of the field's values
            if (fc.fields[fieldId] !== undefined && typeof fc.fields[fieldId] === "string") {
                try {
                    json = $.parseJSON(fc.fields[fieldId]);
                    savedValues = json;
                } catch (ignore) {
                }
            } else if (typeof fc.fields[fieldId] === "object") {
                savedValues = fc.fields[fieldId];
            }

            if (options.length > 0) {
                options = options.split("\n");
                cssClass = getConfig(field, 'inline', false) === true ? 'fc-inline' : 'fc-block';
                for (x = 0; x < options.length; x += 1) {
                    option = options[x].replace(/(\r\n|\n|\r)/gm, "");
                    /*jslint nomen: true*/
                    id = field._id.$id + '_' + x;
                    /*jslint nomen: false*/

                    html += '<div class="' + cssClass + '">';
                    html += '<input class="fc-fieldinput" type="checkbox" id="' + id + '" formcorp-data-id="' + fieldId + '" name="' + fieldId + '[]" value="' + htmlEncode(option) + '" data-required="' + required + '"';

                    if (savedValues.indexOf(option) > -1) {
                        html += ' checked="checked"';
                    }

                    html += '>';
                    html += '<label for="' + id + '">' + htmlEncode(option) + '</label>';
                    html += '</div>';
                }
            }

            return html;
        },

        /**
         * Render a hidden field.
         * @param field
         * @returns {string}
         */
        renderHiddenField = function (field, prefix) {
            if (prefix === undefined) {
                prefix = "";
            }

            /*jslint nomen: true*/
            var fieldId = prefix + field._id.$id,
                html = '<input class="fc-fieldinput" type="hidden" formcorp-data-id="' + fieldId + '" value="' + getConfig(field, 'value') + '">';
            /*jslint nomen: false*/
            return html;
        },

        /**
         * Render a rich text area.
         * @param field
         * @returns {*}
         */
        renderRichText = function (field) {
            if (typeof field.config.rich !== 'string') {
                return '';
            }

            return '<div class="fc-richtext">' + field.config.rich + '</div>';
        },

        /**
         * Creates a dynamic form ready to send to a payment gateway
         * @param dataId
         * @param gateway
         * @param data
         * @returns {*|HTMLElement}
         */
        createDynamicFormFromData = function (dataId, gateway, data) {
            var form, input, key, schema, url;

            // Fetch the field schema
            schema = fc.fieldSchema[dataId];
            if (schema === undefined) {
                return;
            }

            // Check to see if should use the live or sandbox url
            url = getConfig(schema, 'environment', fc.environments.sandbox) === fc.environments.sandbox ? gateway.action.sandbox : gateway.action.live;

            // Instantiate the form
            form = $(document.createElement('form'));
            $(form).attr("action", url);
            $(form).attr("method", gateway.method);

            // Create the form attributes
            for (key in data) {
                if (data.hasOwnProperty(key)) {
                    input = $("<input>").attr("type", "hidden").attr("name", key).val(data[key]);
                    $(form).append($(input));
                }
            }


            return $(form);
        },

        /**
         * Send the payment request to formcorp
         * @param rootElement
         * @param gateway
         * @returns {boolean}
         */
        initPaycorpGateway = function (rootElement, gateway) {
            var data, form, month, cardType, cardNumber;

            // Ensure the client id is all good
            if (gateway.vars === undefined || typeof gateway.vars.clientId !== "string" || gateway.vars.clientId.length === 0) {
                console.log("Malformed paycorp client id");
            }

            // Format the month
            month = rootElement.find('.fc-cc-expirydate-month').val();
            if (month.length === 1) {
                month = '0' + month;
            }

            // Retrieve the card number and type
            cardNumber = rootElement.find('.fc-cc-number input').val().replace(/[^0-9]+/g, "");
            switch (getCreditCardType(cardNumber)) {
                case fc.cardTypes.mastercard:
                    cardType = 'MASTERCARD';
                    break;
                case fc.cardTypes.visa:
                    cardType = 'VISA';
                    break;
                case fc.cardTypes.amex:
                    cardType = 'AMEX';
                    break;
                default:
                    cardType = 'MASTERCARD';
            }

            // Prepare the data to send to paycorp
            data = {
                clientIdHash: gateway.vars.clientId,
                cardType: cardType,
                cardHolderName: rootElement.find('.fc-cc-name input').val(),
                cardNo: cardNumber,
                cardExpiryMM: month,
                cardExpiryYYYY: rootElement.find('.fc-cc-expirydate-year').val(),
                cardSecureId: rootElement.find('.fc-cc-ccv input').val().replace(/[^0-9]+/g, ""),
                paymentAmount: getPaymentAmount(rootElement.attr('fc-data-group')),
                metaData1: rootElement.attr('fc-data-group'),
                metaData2: fc.sessionId
            };

            // Automatically generate a form
            form = createDynamicFormFromData(rootElement.attr('fc-data-group'), fc.gateways.paycorp, data);
            form.submit();

            return false;
        },

        /**
         * Register the event listeners for processing credit card payments
         */
        registerCreditCardListeners = function () {
            // Button to process a payment
            $(fc.jQueryContainer).on('click', '.fc-submit-payment .fc-btn', function () {
                var dataObjectId, rootElement, gateway, schema, localErrors;

                // Retrieve the field id the payment form belongs to
                dataObjectId = $(this).attr('data-for');
                if (dataObjectId === undefined) {
                    return false;
                }
                // Fetch the root credit card instance
                rootElement = $('[fc-data-group="' + dataObjectId + '"]');
                if (rootElement.length === 0) {
                    return false;
                }

                // Fetch the field schema
                schema = fc.fieldSchema[dataObjectId];
                if (schema === undefined) {
                    return false;
                }

                // Validate the payment form before going any further
                localErrors = validCreditCardField(dataObjectId, schema, rootElement.parent());
                // If have errors, output
                if (localErrors.length > 0) {
                    // Log error event
                    logEvent(fc.eventTypes.onFieldError, {
                        fieldId: dataObjectId,
                        errors: localErrors
                    });

                    // Show the error and return
                    showFieldError(dataObjectId, localErrors);
                    return false;
                }

                removeFieldError(dataObjectId);

                // What gateway to use
                gateway = getConfig(schema, 'paymentGateway', {}, true);
                if (typeof gateway.gateway !== "string") {
                    return false;
                }

                // What to do?
                switch (gateway.gateway) {
                    case "paycorp":
                        initPaycorpGateway(rootElement, gateway);
                        break;
                    default:
                        console.log("No gateway to use");
                        break;
                }

                return false;
            });

            fc.processedActions[fc.processes.creditCardListeners] = true;
        },

        /**
         * Render the payment summary table
         * @param field
         * @returns {string}
         */
        renderPaymentSummary = function (field) {
            var html, price;

            price = parseFloat(getPaymentAmount(getId(field))).toFixed(2);

            html = "<div class='fc-table-summary'>";

            // Render the payment summary title as required
            if (getConfig(field, 'paymentSummaryTitle', '').length > 0) {
                html += '<label>' + htmlEncode(getConfig(field, 'paymentSummaryTitle', '')) + '</label>';
            }

            // Render the payment summary description as required
            if (getConfig(field, 'paymentSummaryDescription', '').length > 0) {
                html += '<label>' + getConfig(field, 'paymentSummaryDescription', '') + '</label>';
            }

            html += '<table class="fc-table fc-summary"><thead><tr>';
            html += '<th>' + fc.lang.description + '</th><th class="fc-total">' + fc.lang.total + '</th></tr></thead>';

            // Table body
            html += '<tbody>';
            html += '<tr><td>' + fc.lang.paymentDescription + '<em class="fc-text-right fc-right">' + fc.lang.paymentSubTotal + '</em>';
            html += '</td><td>' + fc.lang.currencySymbol.concat(parseFloat(price / 11 * 10).toFixed(2)) + '</td></tr>';

            // Include the gst?
            if (getConfig(field, 'includeGST', false)) {
                html += '<tr><td class="fc-text-right"><em>' + fc.lang.paymentGst + '</em></td><td>';
                html += fc.lang.currencySymbol.concat(parseFloat(price / 11).toFixed(2)) + '</td></tr>';
            }

            html += '<tr><td class="fc-text-right"><em>' + fc.lang.paymentTotal + '</em></td><td>' + fc.lang.currencySymbol.concat(price) + '</td></tr>';
            html += '</tbody>';

            html += '</table>';
            html += '</div>';
            /*!fc-table-summary*/

            return html;
        },

        /**
         * Render a credit card form
         * @param field
         * @returns {string}
         */
        renderCreditCard = function (field) {
            var html = '',
                month,
                year,
                currentYear = (new Date()).getFullYear(),
                fieldValue,
                error;

            // Render the payment summary
            if (getConfig(field, 'showPaymentSummary', false)) {
                html += renderPaymentSummary(field);
            }

            // Render the label
            html += '<div class="fc-creditCard-header">';
            if (getConfig(field, 'showLabel', false) === true && getConfig(field, 'label', '').length > 0) {
                // Show the label
                html += '<label>' + htmlEncode(getConfig(field, 'label')) + '</label>';
            }

            if (getConfig(field, 'label', '').length > 0) {
                // Show the description
                html += getConfig(field, 'description');
            }

            html += '</div>';
            /*!fc-creditCard-header*/


            // Retrieve the field value and check to see if it's completed
            fieldValue = fc.fields[getId(field)];
            if (fieldValue !== undefined && fieldValue.length > 0) {
                // Successfully been completed, return a completion message
                html += '<div class="fc-payment">';
                html += '<div class="fc-success">' + fc.lang.creditCardSuccess + '</div>';
                html += '</div>';

                return html;
            }

            // If an error was passed through, check
            error = fc.getUrlParameter(fc.config.creditCardErrorUrlParam);
            if (error !== undefined && error.length > 0) {
                html += '<div class="fc-error"><label>' + htmlEncode(error) + '</label></div>';
            }

            // Register the credit card event listeners if not already done so
            if (!processed(fc.processes.creditCardListeners)) {
                registerCreditCardListeners();
            }

            // Initialise basic components
            html += '<div class="fc-payment">';
            html += '<div class="fc-cc-name"><label>' + fc.lang.creditCardNameText + '</label><input type="text" class="fc-fieldinput"></div>';
            html += '<div class="fc-cc-number"><label>' + fc.lang.creditCardNumberText + '</label><input type="text" class="fc-fieldinput"></div>';

            // Render the expiry dates
            html += '<div class="fc-cc-expirydate"><label>' + fc.lang.creditCardExpiryDateText + '</label>';
            html += '<select class="fc-cc-expirydate-month"><option value="" disabled selected>Please select...</option>';
            for (month = 1; month <= 12; month += 1) {
                html += '<option value="' + month + '">' + fc.lang.monthNames[month - 1] + '</option>';
            }
            html += '</select>';

            html += '<select class="fc-cc-expirydate-year"><option value="" disabled selected>Please select...</option>';
            for (year = currentYear; year <= currentYear + 20; year += 1) {
                html += '<option value="' + year + '">' + year + '</option>';
            }
            html += '</select></div>';

            // Render the security code
            html += '<div class="fc-cc-ccv">';
            html += '<label>' + fc.lang.creditCardSecurityCodeText + '</label><input type="text" class="fc-fieldinput">';
            if (fc.config.cvvImage === null) {
                html += '<img src="' + cdnUrl + '/img/cvv.gif" alt="cvv">';
            }
            html += '</div>';

            // Render the pay now button
            html += '<div class="fc-submit-payment">';
            html += '<input class="fc-btn" data-for="' + getId(field) + '" type="submit" value="' + fc.lang.payNow + '"><div class="fc-loading fc-hide"></div>';
            html += '</div>';

            html += '</div>';
            /*!fc-payment*/
            return html;
        },

        /**
         * Render an ABN field
         * @returns {string}
         */
        renderAbnField = function (field, prefix) {
            if (prefix === undefined) {
                prefix = "";
            }

            /*jslint nomen: true*/
            var required = typeof field.config.required === 'boolean' ? field.config.required : false,
                fieldId = prefix + field._id.$id,
                buttonClass = 'fc-button',
                html = '<input class="fc-fieldinput" type="text" formcorp-data-id="' + fieldId + '" data-required="' + required + '" placeholder="' + getConfig(field, 'placeholder') + '">';
            /*jslint nomen: false*/

            // If there exists a valid saved value, hide the button
            if (fc.fields[fieldId] && fc.fields[fieldId].length > 0 && fc.validAbns.indexOf(fc.fields[fieldId]) > -1) {
                buttonClass += ' fc-hide';
            }

            // Button to validate
            html += '<a class="' + buttonClass + '">' + fc.lang.validate + '</a>';
            html += '<div class="fc-loading fc-hide"></div>';

            return html;
        },

        /**
         * Hide and reset a modal
         */
        hideModal = function () {
            fc.activeModalField = null;
            fc.modalState = null;
            fc.modalMeta = {};
            $('.fc-modal.fc-show').removeClass('fc-show');
        },

        /**
         * Verify a mobile or email
         * @param verificationCode
         * @returns {boolean}
         */
        verifyCode = function (verificationCode) {
            var schema,
                data;

            // Retrieve the field schema
            schema = fc.fieldSchema[fc.modalMeta.fieldId];
            if (schema === undefined) {
                return false;
            }

            // Send the request to the API server
            data = {
                fieldId: fc.modalMeta.fieldId,
                code: verificationCode
            };

            // Perform the API request
            $('.fc-modal .modal-footer .fc-loading').removeClass('fc-hide');
            $('.fc-modal .modal-footer .fc-error').html('').addClass('fc-hide');
            api('verification/verify', data, 'POST', function (data) {
                if (typeof data !== "object" || data.success === undefined) {
                    $('.fc-modal .modal-footer .fc-error').html('An unknown error occurred communicating with the API server').removeClass('fc-hide');
                } else if (!data.success && typeof data.message === "string") {
                    $('.fc-modal .modal-footer .fc-error').html(data.message).removeClass('fc-hide');
                } else if (data.success) {
                    // The field was successfully verified
                    $('[fc-data-group="' + fc.modalMeta.fieldId + '"]').addClass('fc-verified');
                    fc.fields[fc.modalMeta.fieldId] = '1';
                    hideModal();
                }

                $('.fc-modal .modal-footer .fc-loading').addClass('fc-hide');
            });
        },

        /**
         * Verify the user email input
         * @returns {boolean}
         */
        verifyEmailAddress = function () {
            verifyCode($('.fc-email-verification-submit input[type=text]').val());
        },

        /**
         * Show the email verification modal
         * @param fieldId
         * @returns {boolean}
         */
        showEmailVerificationModal = function (fieldId) {
            // Configure the modal
            fc.modalState = fc.states.EMAIL_VERIFICATION_CODE;
            fc.modalMeta = {
                fieldId: fieldId
            };

            var modalBody = '<p>To verify your email, input the code sent to your e-mail address in the area below, and click the \'Verify email\' button.</p>';
            modalBody += '<div class="fc-email-verification-submit"><input class="fc-fieldinput" type="text" placeholder="Enter verification code..."></div>';

            // Update the modal html and show it
            $('.fc-modal .modal-header h2').text("Success!");
            $('.fc-modal .modal-body').html(modalBody);
            $('.fc-modal .modal-footer .fc-btn-add').text("Verify email");
            $('.fc-modal').addClass('fc-show');
            return false;
        },

        /**
         * Poll the API intermittently to see if the field has been verified (if it has, update in real time)
         * @param dataId
         */
        waitForVerification = function (dataId) {
            // Need to poll the database intermittently and wait for verification
            api('verification/is-verified', {fieldId: dataId}, 'POST', function (data) {
                if (typeof data === "object" && data.success !== undefined && data.success === true) {
                    // The field has successfully been verified
                    $('[fc-data-group="' + dataId + '"]').addClass('fc-verified');
                    fc.fields[dataId] = '1';
                    hideModal();
                    return;
                }

                // The field has yet to be verified, poll again
                setTimeout(function () {
                    waitForVerification(dataId);
                }, 5000);
            });
        },

        /**
         * Register the email verification event listeners
         */
        registerEmailVerificationListeners = function () {
            // Send an email to the user
            $(fc.jQueryContainer).on('click', '.fc-email-verification .fc-send-email input[type=submit]', function () {
                var elParent = $(this).parent(),
                    data,
                    fieldId;

                elParent.find('.fc-loading').removeClass('fc-hide');
                fieldId = elParent.parent().attr('fc-belongs-to');

                // Data to send with the request
                data = {
                    field: fieldId
                };

                // Send the api callback
                api('verification/callback', data, 'POST', function (data) {
                    elParent.find('.fc-loading').addClass('fc-hide');

                    // On successful request, load a dialog to input the code
                    if (typeof data === "object" && data.success !== undefined && data.success) {
                        showEmailVerificationModal(fieldId);
                        waitForVerification(fieldId);
                    }
                });

                return false;
            });

            // Open the modal
            $(fc.jQueryContainer).on('click', '.fc-email-verification-modal', function () {
                var dataId = $(this).attr('data-for');
                showEmailVerificationModal(dataId);

                return false;
            });

            fc.processedActions[fc.processes.emailListeners] = true;
        },

        /**
         * Render the email verification field
         * @param field
         * @returns {string}
         */
        renderEmailVerification = function (field) {
            // Register the email verification event listeners if required
            if (!processed(fc.processes.emailListeners)) {
                registerEmailVerificationListeners();
            }

            /// Start formatting the html to output
            var html = '',
                fieldValue = fc.fields[getId(field)],
                verified = fieldValue !== undefined && fieldValue === '1';

            // If not verified, show the form to verify
            if (!verified) {
                html += '<div class="fc-email-verification" fc-belongs-to="' + getId(field) + '">';

                html += '<div class="fc-send-email">';
                html += '<input class="fc-btn" type="submit" value="' + fc.lang.sendEmail + '"><div class="fc-loading fc-hide"></div>';
                html += '<div class="fc-clear fc-verification-options">';
                html += '<p><small>Already have a verification code? Click <a href="#" class="fc-email-verification-modal" data-for="' + getId(field) + '">here</a> to validate.</small></p>';
                html += '</div></div>';

                html += '</div>';
                /*!fc-email-verification*/
            }

            // Success text
            html += '<div class="fc-success' + (verified ? ' fc-force-show' : '') + '">';
            html += fc.lang.fieldValidated;
            html += '</div>';
            /*!fc-success*/

            return html;
        },

        /**
         * Verify the mobile phone number
         * @returns {boolean}
         */
        verifyMobileNumber = function () {
            verifyCode($('.fc-sms-verification-submit input[type=text]').val());
        },

        /**
         * Show the email verification modal
         * @param fieldId
         * @returns {boolean}
         */
        showSmsVerificationModal = function (fieldId) {
            // Configure the modal
            fc.modalState = fc.states.SMS_VERIFICATION_CODE;
            fc.modalMeta = {
                fieldId: fieldId
            };

            var modalBody = '<p>To verify your mobile, input the code sent to you via SMS in the area below, and click the \'Verify mobile\' button.</p>';
            modalBody += '<div class="fc-sms-verification-submit"><input class="fc-fieldinput" type="text" placeholder="Enter verification code..."></div>';

            // Update the modal html and show it
            $('.fc-modal .modal-header h2').text("Success!");
            $('.fc-modal .modal-body').html(modalBody);
            $('.fc-modal .modal-footer .fc-btn-add').text("Verify mobile");
            $('.fc-modal').addClass('fc-show');
            return false;
        },

        /**
         * Register the event listeners for SMS verifications
         */
        registerSmsVerificationListeners = function () {
            // Send an email to the user
            $(fc.jQueryContainer).on('click', '.fc-sms-verification .fc-send-sms input[type=submit]', function () {
                var elParent = $(this).parent(),
                    data,
                    fieldId;

                elParent.find('.fc-loading').removeClass('fc-hide');
                fieldId = elParent.parent().attr('fc-belongs-to');

                // Data to send with the request
                data = {
                    field: fieldId
                };

                // Send the api callback
                api('verification/callback', data, 'POST', function (data) {
                    elParent.find('.fc-loading').addClass('fc-hide');

                    // On successful request, load a dialog to input the code
                    if (typeof data === "object" && data.success !== undefined && data.success) {
                        showSmsVerificationModal(fieldId);
                        waitForVerification(fieldId);
                    }
                });

                return false;
            });

            // Open the modal
            $(fc.jQueryContainer).on('click', '.fc-sms-verification-modal', function () {
                var dataId = $(this).attr('data-for');
                showSmsVerificationModal(dataId);

                return false;
            });

            fc.processedActions[fc.processes.emailListeners] = true;
        },

        /**
         * Render the sms verification field
         * @param field
         * @returns {string}
         */
        renderSmsVerification = function (field) {
            // Register the email verification event listeners if required
            if (!processed(fc.processes.smsListeners)) {
                registerSmsVerificationListeners();
            }

            /// Start formatting the html to output
            var html = '',
                fieldValue = fc.fields[getId(field)],
                verified = fieldValue !== undefined && fieldValue === '1';

            // If not verified, show the form to verify
            if (!verified) {
                html += '<div class="fc-sms-verification" fc-belongs-to="' + getId(field) + '">';

                html += '<div class="fc-send-sms">';
                html += '<input class="fc-btn" type="submit" value="' + fc.lang.sendSms + '"><div class="fc-loading fc-hide"></div>';
                html += '<div class="fc-clear fc-verification-options">';
                html += '<p><small>Already have a verification code? Click <a href="#" class="fc-sms-verification-modal" data-for="' + getId(field) + '">here</a> to validate.</small></p>';
                html += '</div></div>';

                html += '</div>';
                /*!fc-email-verification*/
            }

            // Success text
            html += '<div class="fc-success' + (verified ? ' fc-force-show' : '') + '">';
            html += fc.lang.fieldValidated;
            html += '</div>';
            /*!fc-success*/

            return html;
        },

        /**
         * Render a string on the review table
         *
         * @param field
         * @param value
         * @returns {string}
         */
        renderReviewTableString = function (field, value) {
            var html = "", json, iterator, val;

            // If field not properly initialised, return nothing
            if (field === undefined || !field.type) {
                return '';
            }

            // Do not render for particular types
            if (["emailVerification", "smsVerification", "signature", "creditCard"].indexOf(field.type) > -1) {
                return '';
            }

            // Do not render for readonly fields
            if (getConfig(field, 'readOnly', false)) {
                return '';
            }

            html += "<tr><td>" + getShortLabel(field) + "</td><td>";

            // If a string, output safely
            if (['[', '{'].indexOf(value.substring(0, 1)) > -1) {
                try {
                    json = $.parseJSON(value);
                    value = json;
                } catch (ignore) {
                }
            }

            // If string, output
            if (typeof value === "string") {
                html += htmlEncode(value);
            } else if (typeof value === "object") {
                html += "<ul class='fc-list'>";
                for (iterator = 0; iterator < value.length; iterator += 1) {
                    val = value[iterator];
                    html += "<li>" + htmlEncode(val) + "</li>";
                }
                html += "</ul>";
            }

            html += "</td></tr>";

            return html;
        },

        /**
         * Render an array'd value for the review table
         *
         * @param field
         * @param value
         */
        renderReviewTableArray = function (field, value) {
            var html = "", iterator, parts, key;

            // Array - repeatable grouplet
            for (iterator = 0; iterator < value.length; iterator += 1) {
                if (typeof value[iterator] === "object") {
                    html += "<tr><th colspan='2'>" + htmlEncode(getShortLabel(field)) + " #" + (iterator + 1) + "</th></tr>";

                    for (key in value[iterator]) {
                        if (value[iterator].hasOwnProperty(key)) {
                            if (value[iterator][key].length > 0) {
                                if (key.indexOf(fc.constants.prefixSeparator) > -1) {
                                    parts = key.split(fc.constants.prefixSeparator);
                                    html += "<tr><td>" + getShortLabel(fc.fieldSchema[parts[parts.length - 1]]);
                                    html += "</td><td>" + htmlEncode(value[iterator][key]) + "</td></tr>";
                                }
                            }
                        }
                    }
                }
            }

            return html;
        },

        renderReviewTableGrouplet,
        renderSummaryField,

        /**
         * Render the review table
         * @param fieldId
         * @returns {*}
         */
        renderReviewTable = function (fieldId) {
            var html, stageIterator, stage, pageIterator, page, sectionIterator, section, fieldIterator, field, pageHtml;

            html = '<div class="fc-form-summary fc-review-table">';
            html += '<table class="fc-table"><thead><tr><th class="fc-field-col">Field</th><th>Value</th></tr></thead><tbody>';

            // Loop through every page, output every field that has a value
            for (stageIterator = 0; stageIterator < fc.schema.stage.length; stageIterator += 1) {
                stage = fc.schema.stage[stageIterator];

                // Confirm the stage has a set of pages
                if (stage === undefined || stage.page === undefined || typeof stage.page !== "object") {
                    continue;
                }

                // Iterate through each page
                for (pageIterator = 0; pageIterator < stage.page.length; pageIterator += 1) {
                    page = stage.page[pageIterator];

                    // Confirm the page has a set of sections
                    if (page === undefined || page.section === undefined || typeof page.section !== "object") {
                        continue;
                    }

                    pageHtml = "";

                    // Iterate through each page section
                    for (sectionIterator = 0; sectionIterator < page.section.length; sectionIterator += 1) {
                        section = page.section[sectionIterator];

                        // Ensure the section has a set of fields
                        if (section === undefined || section.field === undefined || typeof section.field !== "object") {
                            continue;
                        }

                        // Iterate through each field
                        for (fieldIterator = 0; fieldIterator < section.field.length; fieldIterator += 1) {
                            field = section.field[fieldIterator];

                            pageHtml += renderSummaryField(field);
                        }
                    }

                    // If the page rendered any fields, display it
                    if (pageHtml.length > 0) {
                        html += "<tr><th colspan='2'>" + htmlEncode(page.label) + "</th></tr>";
                        html += pageHtml;
                    }
                }
            }

            html += '</tbody></table></div>';
            /*!fc-form-summary*/

            return html;
        },

        /**
         * Returns true if a page is deemed to be a submission page
         * @param page
         * @returns {boolean}
         */
        isSubmitPage = function (page) {
            if (typeof page !== "object" || page.completion === undefined) {
                return false;
            }

            return page.completion === true || (typeof page.completion === 'string' && ["1", "true"].indexOf(page.completion.toLowerCase()) !== -1);
        },

        /**
         * Deletes a session and forces the user to fill out a new application.
         * @param changeDom
         */
        deleteSession = function (changeDom) {
            if (typeof changeDom !== 'boolean') {
                changeDom = true;
            }

            $.removeCookie(fc.config.sessionIdName);

            if (changeDom) {
                $(fc.jQueryContainer + ' .render').html(fc.lang.sessionExpiredHtml);
                $(fc.jQueryContainer).trigger(fc.jsEvents.onFormExpired);
            }
            fc.expired = true;
        },

        /**
         * Intermittently check to see if the user has timed out
         */
        timeout = function () {
            if (fc.config.timeUserOut !== true) {
                return;
            }

            var timeSinceLastActivity = (new Date()).getTime() - fc.lastActivity,
                sessionExtension;

            if (timeSinceLastActivity > (fc.config.timeOutAfter * 1000)) {
                // The user's session has expired
                deleteSession();
            } else if (timeSinceLastActivity > (fc.config.timeOutWarning * 1000)) {
                // Display a warning to the user to see if they want to extend their session
                sessionExtension = confirm('Your session is about to expire. Do you want to extend your session?');
                timeSinceLastActivity = (new Date()).getTime() - fc.lastActivity;

                if (sessionExtension === true && timeSinceLastActivity < (fc.config.timeOutAfter * 1000)) {
                    api('page/ping', {}, 'put', function (data) {
                        if (typeof data === "object" && data.success === true) {
                            fc.lastActivity = (new Date()).getTime();
                        }
                    });
                } else {
                    // The user waited too long before extending their session
                    deleteSession();
                }
            }
        },

        /**
         * Given an input field, will traverse through the DOM to find the next form element
         *
         * @param currentField
         * @param mustBeEmpty
         * @returns {*}
         */
        nextVisibleField = function (currentField, mustBeEmpty) {
            var foundField = false,
                foundId;

            // Only return fields whose value isnt empty
            if (typeof mustBeEmpty !== 'boolean') {
                mustBeEmpty = true;
            }

            // Iterate through visible fields
            $('.fc-section:not(.fc-hide) div.fc-field:not(.fc-hide)').each(function () {
                var id = $(this).attr('fc-data-group');

                if (!foundField && id === currentField) {
                    foundField = true;
                    return;
                }

                // If the field has been found, return the next
                if (foundField && !foundId) {
                    if (mustBeEmpty && !fc.fields[id]) {
                        foundId = id;
                        return;
                    }

                    if (!mustBeEmpty) {
                        foundId = id;
                    }
                }
            });

            return foundId;
        },

        /**
         * Sooth scroll to a page
         * @param pageId
         */
        smoothScrollToPage = function (pageId) {
            var offset,
                pageDiv;

            // If the last edited field disables scrolling, do not scroll
            if (fc.lastCompletedField && fc.fieldSchema[fc.lastCompletedField] && !getConfig(fc.fieldSchema[fc.lastCompletedField], 'allowAutoScroll', true)) {
                return;
            }

            // Only want to scroll once
            if (fc.activeScroll.length > 0) {
                return;
            }
            fc.activeScroll = pageId;

            pageDiv = $('.fc-page:last');
            if (pageDiv.length > 0 && pageDiv.attr('data-page-id') === pageId) {
                offset = parseInt(pageDiv.offset().top, 10) + parseInt(fc.config.scrollOffset, 10);

                // If at the top of the page, apply the initial offset
                if ($(document).scrollTop() === 0) {
                    offset += fc.config.initialScrollOffset;
                }

                // Apply a conditional offset
                if (fc.config.conditionalHtmlScrollOffset.class !== undefined) {
                    if ($('html').hasClass(fc.config.conditionalHtmlScrollOffset.class)) {
                        offset += fc.config.conditionalHtmlScrollOffset.offset;
                    }
                }

                // Scroll to the offset
                scrollToOffset(offset);
            }
        },

        /**
         * Validate an ABN
         *
         * @param dataId
         * @param abn
         * @param callback
         */
        validateAbn = function (dataId, abn, callback) {
            var
                /**
                 * Initialise the ajax callback
                 * @param data
                 */
                initCallback = function (data) {
                    if (typeof data === 'string') {
                        try {
                            data = $.parseJSON(data);
                        } catch (ignore) {
                        }
                    }

                    if (callback && typeof callback === 'function') {
                        callback(data);
                    }
                };

            // Send the API call
            api('verification/abn', {
                abn: abn
            }, 'POST', initCallback);
        },

        /**
         * Set the field schemas on initial schema load
         * @param fields
         */
        setFieldSchemas = function (fields) {
            var iterator, value;

            if (typeof fields !== "object") {
                return;
            }

            // If a field is detected, add it
            /*jslint nomen: true*/
            if (fields.config && fields.type && fields._id && fields._id.$id) {
                fc.fieldSchema[fields._id.$id] = fields;
                return;
            }
            /*jslint nomen: false*/

            if (typeof fields === 'object') {
                for (iterator in fields) {
                    if (fields.hasOwnProperty(iterator)) {
                        value = fields[iterator];
                        if (typeof value === "object") {
                            setFieldSchemas(value);
                        }
                    }
                }
            }
        },

        /**
         * Auto scroll to field.
         * @param fromFieldId
         * @param nextField
         */
        autoScrollToField = function (fromFieldId, nextField) {
            var el, topDistance, sessionId;

            // Scroll from one field to another section
            if (nextField !== undefined) {
                el = $('.fc-field[fc-data-group="' + nextField + '"]');

                if (el && el.length > 0) {
                    sessionId = el.attr('fc-belongs-to');
                    if (sessionId !== $('.fc-field[fc-data-group="' + fromFieldId + '"]').attr('fc-belongs-to')) {
                        el = $('.fc-section[formcorp-data-id="' + sessionId + '"]');
                    }

                    if (el && el.length > 0) {
                        topDistance = parseInt(el.offset().top, 10) + fc.config.scrollOffset;
                        if (parseInt($(document).scrollTop(), 10) < topDistance) {
                            scrollToOffset(topDistance);
                        }
                    }
                }
            } else {
                // Otherwise just scroll to the field specified in the first parameter
                el = $('.fc-field[fc-data-group="' + fromFieldId + '"]');
                if (el && el.length > 0) {
                    topDistance = parseInt(el.offset().top, 10) + fc.config.scrollOffset;
                    scrollToOffset(topDistance);
                }
            }
        },

        /**
         * Tokenises a string.
         *
         * @param raw
         * @param additionalTokens
         * @returns {*}
         */
        tokenise = function (raw, additionalTokens) {
            if (!additionalTokens) {
                additionalTokens = {};
            }

            var tokenisedString = raw,
                tokens = raw.match(/\{\{([a-zA-Z0-9-_.]+)\}\}/g),
                iterator = 0,
                tags = getFieldTagValues(),
                token,
                replacement = '';

            // Iterate through each token
            if (tokens && $.isArray(tokens) && tokens.length > 0) {
                for (iterator = 0; iterator < tokens.length; iterator += 1) {
                    token = tokens[iterator].replace(/[\{\}]+/g, '');
                    replacement = tags[token] !== undefined ? tags[token] : '';
                    replacement = '<span class="fc-token" data-token="' + htmlEncode(token) + '">' + replacement + '</span>';

                    tokenisedString = tokenisedString.replace(new RegExp(tokens[iterator].escapeRegExp(), 'g'), replacement);
                }
            }

            return tokenisedString;
        },

        /**
         * Returns true if a field is visible
         * @param dataId
         * @returns {boolean}
         */
        fieldIsVisible = function (dataId) {
            var el;

            if (typeof dataId === 'string' && dataId.length > 0) {
                el = $('.fc-field[fc-data-group="' + dataId + '"]');
                if (el.length > 0 && !el.hasClass('fc-hide')) {
                    return true;
                }
            }

            return false;
        },

        /**
         * Auto scroll to the first visible error on the page
         */
        scrollToFirstError = function () {
            var fieldErrors = $(fc.jQueryContainer).find('.fc-field.fc-error'),
                dataId,
                firstError;

            // Find the first error
            if (fieldErrors.length > 0) {
                fieldErrors.each(function () {
                    // If already found an error, do nothing
                    if (firstError !== undefined) {
                        return;
                    }
                    dataId = $(this).attr('fc-data-group');

                    // If the field is visible, scroll to this field
                    if (fieldIsVisible(dataId)) {
                        firstError = dataId;
                    }
                });
            }

            // If an error was found, scroll to it
            if (firstError !== undefined) {
                autoScrollToField(firstError);
            }
        },

        /**
         * Show the modal dialog
         * @param config
         */
        showModal = function (config) {
            var defaults = {
                    addButton: true,
                    body: '',
                    title: fc.lang.defaultModalTitle
                },
                vars = $.extend({}, defaults, config),
                elements = {
                    addButton: $(fc.jQueryContainer).find('.fc-modal .modal-footer .fc-btn-add')
                };

            // Toggle visibility on the add button
            if (elements.addButton.length > 0) {
                if (vars.addButton === false) {
                    elements.addButton.hide();
                } else {
                    elements.addButton.show();
                }
            }

            // Show the title
            if (vars.title) {
                $('.fc-modal .modal-header h2').text(vars.title);
            }

            // Display the modal
            $('.fc-modal .modal-body').html(vars.body);
            $('.fc-modal').addClass('fc-show');
        },

        initGreenId = function () {
            var fieldId,
                hasGreenId = false;

            // Iterate through and check if green id field exists
            for (fieldId in fc.fieldSchema) {
                if (fc.fieldSchema.hasOwnProperty(fieldId) && fc.fieldSchema[fieldId].type === 'greenIdVerification') {
                    hasGreenId = true;
                    break;
                }
            }

            // If the form field has green id verification,
            if (hasGreenId) {
                // Initialise the worker and set the event listener
                $(fc.jQueryContainer).on(fc.jsEvents.onGreenIdLoaded, function () {
                    fc.greenID = fcGreenID;
                    fc.greenID.init();
                });

                loadJsFile(cdnUrl + fc.constants.greenId.scriptPath);
            }
        },

        onSchemaLoaded = function () {
            initGreenId();
        },

        updateMobileFieldsVisibility,
        renderGrouplet,
        renderFields,
        renderPageSections,
        generateRandomString,
        loadCssFiles,
        addModalWindow,
        pruneNonPageFields,
        removeInvisibleSectionFields,
        pruneInvisibleFields,
        fieldIsValid,
        formFieldsValid,
        checkAutoLoad,
        getFirstPageId,
        getFirstPage,
        loadSettings,
        loadSchema,
        hasNextPage,
        loadNextPage,
        processSaveQueue,
        showDeleteDialog,
        showRepeatableEditDialog,
        addRepeatableRow,
        editRepeatableRow,
        deleteRepeatableRow,
        registerRepeatableGroupletListeners,
        registerOnePageListeners,
        registerEventListeners,
        nextPage,
        render,
        renderPage,
        flushVisibility,
        flushSectionVisibility,
        flushFieldVisibility,
        registerValueChangedListeners,
        valueChanged,
        validateModal,
        orderSchema,
        renderSignature,
        loadSignatureLibs,
        orderObject,
        renderRepeatableIterator,
        renderApiLookupField,
        registerApiLookupListener,
        renderAutoCompleteWidget,
        removeAutoCompleteWidget;

    /**
     * Load the libraries required for signature fields
     */
    loadSignatureLibs = function () {
        var sigBlock;

        // Event listener for initialising the signature
        $(fc.jQueryContainer).on(fc.jsEvents.onFinishRender, function () {
            var dataId;

            sigBlock = $(fc.jQueryContainer).find('.' + fc.config.signatureClass);
            if (sigBlock.length > 0) {
                sigBlock.each(function () {
                    dataId = $(this).attr('data-for');
                    fc.renderedSignatures[dataId] = $(this).signaturePad({
                        drawOnly: true,
                        onDrawEnd: function () {
                            var key, signature;

                            // Update and queue the signature for saving
                            for (key in fc.renderedSignatures) {
                                if (fc.renderedSignatures.hasOwnProperty(key)) {
                                    signature = fc.renderedSignatures[key].getSignatureString();
                                    if (fc.fields[key] === undefined || fc.fields[key] !== signature) {
                                        valueChanged(key, signature);
                                    }
                                }
                            }
                        }
                    });

                    // If a value has been set, restore it
                    if (fc.fields[dataId] !== undefined && fc.fields[dataId].length > 0) {
                        fc.renderedSignatures[dataId].regenerate(fc.fields[dataId]);
                    }
                });

            }
        });

        fc.processedActions[fc.processes.loadSignatureLibs] = true;
    };

    /**
     * Render the signature field
     * @param field
     * @returns {string}
     */
    renderSignature = function (field, prefix) {
        var html = '';

        // Initialise the signature libraries if required
        if (!processed(fc.processes.loadSignatureLibs)) {
            loadSignatureLibs();
        }

        html = '<div class="' + fc.config.signatureClass + '" formcorp-data-id="' + prefix + getId(field) + '" data-for="' + prefix + getId(field) + '"> <ul class="sigNav"> <li class="clearButton"><a href="#clear">Clear</a></li> </ul> <div class="sig sigWrapper"> <div class="typed"></div> <canvas class="pad" width="400" height="75"></canvas> <input type="hidden" name="output" class="output"> </div></div>';

        return html;
    };

    /**
     * Render a grouplet on the review table
     *
     * @param field
     * @param value
     * @returns {*}
     */
    renderReviewTableGrouplet = function (field, value) {
        var html = "", key;

        // Grouplet, need to recursively output
        for (key in value) {
            if (value.hasOwnProperty(key)) {
                html += renderSummaryField(fc.fieldSchema[key], value[key]);
            }
        }

        return html;
    };

    /**
     * Render review table field
     * @param field
     * @param value
     * @returns {string}
     */
    renderSummaryField = function (field, value) {
        var html = '', id, isValidObject, isValidString;

        // Retrieve the id of the field and its value
        id = getId(field);
        if (value === undefined) {
            value = fc.fields[id];
        }

        // If the valid is valid, proceed
        if (value !== undefined) {
            isValidObject = typeof value === "object" && (($.isArray(value) && value.length > 0) || !$.isEmptyObject(value));
            isValidString = typeof value === "string" && value.length > 0;

            // If object with enumerable keys or string with length greater than 0
            if (isValidObject || isValidString) {
                if (isValidString) {
                    html += renderReviewTableString(field, value);
                } else if (isValidObject) {
                    if ($.isArray(value)) {
                        html += renderReviewTableArray(field, value);
                    } else {
                        html += renderReviewTableGrouplet(field, value);
                    }
                }
            }
        }

        return html;
    };

    /**
     * Render a grouplet.
     * @param field
     * @returns {string}
     */
    renderGrouplet = function (field) {
        /*jslint nomen: true*/
        var fieldId = field._id.$id,
            html = '',
            fields;
        /*jslint nomen: false*/

        if (typeof field.config.grouplet === 'object') {
            fields = field.config.grouplet.field;
            html += renderFields(fields, field, [fieldId]);
        }

        // If the grouplet is repeatable, need to mark it as such
        if (getConfig(field, 'repeatable', false) === true) {
            html = '<div class="fc-data-repeatable-grouplet" formcorp-data-id="' + fieldId + '">' + html + '</div>';
        }

        return html;
    };

    /**
     * Render a collection of fields.
     * @param fields
     * @param section
     * @returns {string}
     */
    renderFields = function (fields, section, prefix) {
        var html = '',
            y,
            field,
            required,
            fieldHtml,
            dataId,
            fieldId,
            groupletId,
            visibility,
            matches,
            iterator,
            match,
            re,
            helpTitle;

        // Field id prefix (for grouplet fields that may be shown multiple times)
        if (prefix === undefined) {
            prefix = "";
        } else if (typeof prefix === "object") {
            prefix = prefix.join(fc.constants.prefixSeparator) + fc.constants.prefixSeparator;
        }

        // Populate the grouplet array first
        if (prefix.length > 0) {
            groupletId = (prefix.substr(-1) === fc.constants.prefixSeparator) ? prefix.substr(0, prefix.length - 1) : prefix;
            for (y = 0; y < fields.length; y += 1) {
                field = fields[y];
                if (!fc.fieldGrouplets[groupletId]) {
                    fc.fieldGrouplets[groupletId] = [];
                }

                if (fc.fieldGrouplets[groupletId].indexOf(getId(field)) === -1) {
                    fc.fieldGrouplets[groupletId].push(getId(field));
                }
            }
        }

        // Iterate through and render fields
        for (y = 0; y < fields.length; y += 1) {
            field = fields[y];
            required = getConfig(field, 'required', false);
            /*jslint nomen: true*/
            fieldId = prefix + field._id.$id;
            fieldHtml = '<div class="';

            // If field has an associated tag, output it
            if (getConfig(field, 'tag', '').length > 0) {
                fieldHtml += 'fc-tag-' + getConfig(field, 'tag', '') + ' ';
            }

            // If field is repeatable, mark it as so
            if (getConfig(field, 'repeatable', false) === true) {
                fieldHtml += 'fc-repeatable-container ';
            }

            // Add condition if mobile only fields
            if (getConfig(field, 'mobileOnly', false) === true) {
                fieldHtml += 'fc-mobile-field ';
            } else if (getConfig(field, 'desktopOnly', false) === true) {
                fieldHtml += 'fc-desktop-field ';
            }

            fieldHtml += 'fc-field fc-field-' + field.type + '" fc-data-group="' + fieldId + '" data-required="' + required + '"';

            // If a section was passed through, track which section the field belongs to
            if (section !== undefined && typeof section === "object") {
                fieldHtml += ' fc-belongs-to="' + section._id.$id + '"';
            }

            fieldHtml += '>';

            // Fields that belong to a grouplet who have a visibility toggle need updating
            if (prefix && prefix.length > 0 && getConfig(field, 'visibility', '').length > 0) {
                visibility = getConfig(field, 'visibility');
                matches = visibility.match(/"([a-zA-Z0-9]{24})"/g);
                if (matches && matches.length > 0) {
                    for (iterator = 0; iterator < matches.length; iterator += 1) {
                        match = matches[iterator].replace(/"/g, "");
                        if (fc.fieldGrouplets[groupletId].indexOf(match) > 0) {
                            re = new RegExp(match, 'g');
                            field.config.visibility = field.config.visibility.replace(re, prefix + match);
                        }
                    }
                }
            }

            // Add to field class variable if doesnt exist
            dataId = fieldId;
            /*jslint nomen: false*/
            if (fc.fieldSchema[dataId] === undefined) {
                fc.fieldSchema[dataId] = field;
            }

            // Description text - show before the label (for certain fields)
            if (["creditCard"].indexOf(field.type) === -1) {
                if (fc.config.descriptionBeforeLabel === true && getConfig(field, 'description').replace(/(<([^>]+)>)/ig, "").length > 0) {
                    fieldHtml += '<div class="fc-desc">' + getConfig(field, 'description') + '</div>';
                }
            }

            fieldHtml += '<div class="fc-fieldcontainer">';

            // Field label - don't show in this position for certain fields
            if (["creditCard"].indexOf(field.type) === -1) {
                if (getConfig(field, 'showLabel', false) === true && getConfig(field, 'label', '').length > 0) {
                    fieldHtml += '<label>';
                    fieldHtml += tokenise(field.config.label);

                    // If set to open help data in a modal, output the link
                    if (fc.config.helpAsModal && getConfig(field, 'help').replace(/(<([^>]+)>)/ig, "").length > 0) {
                        if (fc.helpData === undefined) {
                            fc.helpData = [];
                            fc.helpTitle = [];
                        }
                        fc.helpData.push(getConfig(field, 'help'));

                        // The title to use for the help link
                        helpTitle = getConfig(field, 'helpTitle', '');
                        if (helpTitle.length === 0) {
                            helpTitle = fc.lang.helpModalLink;
                        }
                        fc.helpTitle.push(helpTitle);

                        fieldHtml += ' <a class="fc-help-link" href="#" data-for="' + (fc.helpData.length - 1) + '">' + helpTitle + '</a>';
                    }

                    fieldHtml += '</label>';
                }

                // Show the description after the label
                if (fc.config.descriptionBeforeLabel === false && getConfig(field, 'description').replace(/(<([^>]+)>)/ig, "").length > 0) {
                    fieldHtml += '<div class="fc-desc">' + tokenise(getConfig(field, 'description')) + '</div>';
                }
            }

            // Output a repeatable field
            if (getConfig(field, 'repeatable', false) === true) {
                fieldHtml += '<div class="fc-repeatable">';
                fieldHtml += '<div class="fc-summary"></div>';
                fieldHtml += '<div class="fc-link"><a href="#" class="fc-click" data-id="' + dataId + '">' + fc.lang.addFieldTextValue + '</a></div>';
            }

            fieldHtml += '<div class="fc-fieldgroup">';

            switch (field.type) {
                case 'text':
                    fieldHtml += renderTextfield(field, prefix);
                    break;
                case 'dropdown':
                    fieldHtml += renderDropdown(field, prefix);
                    break;
                case 'textarea':
                    fieldHtml += renderTextarea(field, prefix);
                    break;
                case 'radioList':
                    fieldHtml += renderRadioList(field, prefix);
                    break;
                case 'checkboxList':
                    fieldHtml += renderCheckboxList(field, prefix);
                    break;
                case 'hidden':
                    fieldHtml += renderHiddenField(field, prefix);
                    break;
                case 'richTextArea':
                    fieldHtml += renderRichText(field, prefix);
                    break;
                case 'grouplet':
                    fieldHtml += renderGrouplet(field, prefix);
                    break;
                case 'creditCard':
                    fieldHtml += renderCreditCard(field, prefix);
                    break;
                case 'emailVerification':
                    fieldHtml += renderEmailVerification(field, prefix);
                    break;
                case 'smsVerification':
                    fieldHtml += renderSmsVerification(field, prefix);
                    break;
                case 'reviewTable':
                    fieldHtml += renderReviewTable(field, prefix);
                    break;
                case 'signature':
                    fieldHtml += renderSignature(field, prefix);
                    break;
                case 'contentRadioList':
                    fieldHtml += renderContentRadioList(field, prefix);
                    break;
                case 'optionTable':
                    fieldHtml += renderOptionTable(field, prefix);
                    break;
                case 'abnVerification':
                    fieldHtml += renderAbnField(field, prefix);
                    break;
                case 'repeatableIterator':
                    fieldHtml += renderRepeatableIterator(field, prefix);
                    break;
                case 'apiLookup':
                    fieldHtml += renderApiLookupField(field, prefix);
                    break;
                default:
                    console.log('Unknown field type: ' + field.type);
            }

            fieldHtml += '<div class="fc-error-text"></div>';

            // Help text
            if (!fc.config.helpAsModal && getConfig(field, 'help').replace(/(<([^>]+)>)/ig, "").length > 0) {
                fieldHtml += '<div class="fc-help">' + getConfig(field, 'help') + '</div>';
            }

            if (getConfig(field, 'repeatable', false) === true) {
                fieldHtml += '</div>';
            }

            fieldHtml += '<div class="fc-empty"></div></div>';
            fieldHtml += '</div></div>';
            html += fieldHtml;
        }

        return html;
    };

    /**
     * Render repeatable iterator field
     * @param field
     * @param prefix
     * @returns {string}
     */
    renderRepeatableIterator = function (field, prefix) {
        if (prefix === undefined) {
            prefix = '';
        }

        // Initialise variables
        /*jslint nomen: true*/
        var required = getConfig(field, 'required', false),
            fieldId = prefix + field._id.$id,
            html = '',
            sourceField = getConfig(field, 'sourceField', ''),
            source,
            iterator,
            rowValues,
            tags,
            rowFieldId,
            data,
            tagValues,
            row;
        /*jslint nomen: false*/

        // Check to ensure the field exists
        if (fc.fields[sourceField] === undefined) {
            return html;
        }

        // Check to ensure source field values is an array
        source = fc.fields[sourceField];
        if (!$.isArray(source) || source.length === 0) {
            return '';
        }

        // Retrieve tag and tag values
        tags = getFieldTags();
        tagValues = getFieldTagValues();

        html += '<div class="fc-iterator">';

        // Iterate through each value row
        for (iterator = 0; iterator < source.length; iterator += 1) {
            // Map tags against values as well (for token replacement)
            rowValues = fc.fields[sourceField][iterator];
            for (rowFieldId in rowValues) {
                if (rowValues.hasOwnProperty(rowFieldId) && tags[rowFieldId] !== undefined) {
                    rowValues[tags[rowFieldId]] = rowValues[rowFieldId];
                }
            }

            // Data to set for token replacement
            data = $.extend({}, tagValues, rowValues);

            // Build row html
            row = '<div class="fc-iterator-row">';
            row += renderFields(field.config.targetGrouplet.field, field, [fieldId, iterator]);
            row += '</div>';

            // Replace tokens and add to html
            row = replaceTokensInDom($(row), data);
            html += row.prop('outerHTML');
        }

        html += '</div>';


        return html;
    };

    /**
     * Render an API look-up field.
     *
     * @param field
     * @param prefix
     * @returns {string}
     */
    renderApiLookupField = function (field, prefix) {
        if (prefix === undefined) {
            prefix = "";
        }

        /*jslint nomen: true*/
        var required = typeof field.config.required === 'boolean' ? field.config.required : false,
            fieldId = prefix + field._id.$id,
            html = '<input class="fc-fieldinput" type="text" formcorp-data-id="' + fieldId + '" data-required="' + required + '" placeholder="' + getConfig(field, 'placeholder') + '">';
        /*jslint nomen: false*/
        return html;
    };

    /**
     * Render page sections.
     * @param sections
     * @returns {string}
     */
    renderPageSections = function (sections) {
        var html = '',
            x,
            section,
            sectionHtml;

        for (x = 0; x < sections.length; x += 1) {
            section = sections[x];
            /*jslint nomen: true*/
            sectionHtml = '<div class="fc-section fc-section-' + section._id.$id + '" formcorp-data-id="' + section._id.$id + '">';
            /*jslint nomen: false*/

            if (typeof section.label === 'string' && section.label.length > 0) {
                sectionHtml += '<h4>' + section.label + '</h4>';
            }

            if (typeof section.description === 'string' && section.description.length > 0) {
                sectionHtml += '<p>' + section.description + '</p>';
            }

            // Render the fields
            if (section.field !== undefined && section.field.length > 0) {
                sectionHtml += renderFields(section.field, section);
            }

            sectionHtml += '<div class="fc-section-end"></div>';
            sectionHtml += '</div>';
            html += sectionHtml;
        }

        return html;
    };

    /**
     * Returns true when a next stage exists.
     * @returns {boolean}
     */
    hasNextPage = function () {
        return nextPage(false);
    };

    /**
     * Render a page.
     * @param page
     * @returns {string}
     */
    renderPage = function (page) {
        // Page details
        /*jslint nomen: true*/
        var pageDiv = '<div class="fc-page" data-page-id="' + page.page._id.$id + '">',
            submitText = fc.lang.submitText,
            nextPageObj;
        /*jslint nomen: false*/

        pageDiv += '<h1>' + page.stage.label + '</h1>';
        page = page.page;

        /*jslint nomen: true*/
        fc.pageId = page._id.$id;
        /*jslint nomen: false*/
        if (typeof page.label === 'string' && page.label.length > 0) {
            pageDiv += '<h2>' + page.label + '</h2>';
        }
        if (typeof page.description === 'string' && page.description.length > 0) {
            pageDiv += '<h3>' + page.description + '</h3>';
        }

        // Render page sections
        if (page.section.length > 0) {
            pageDiv += renderPageSections(orderObject(page.section));
        }

        nextPageObj = nextPage(false, true);

        // Submit button when a next page exists, or no next page exists
        if (typeof nextPageObj === "object" || (isSubmitPage(page) === false && nextPageObj === false)) {
            // If the next stage is a completion page, alter the submission text
            if ((isSubmitPage(page) === false && nextPageObj === false) || (typeof nextPageObj.page === 'object' && isSubmitPage(nextPageObj.page))) {
                submitText = fc.lang.submitFormText;
            }

            // Only render pagination on non-submission pages
            if (!isSubmitPage(page)) {
                pageDiv += '<div class="fc-pagination">';

                // Show the prev stage button
                if (fc.config.showPrevPageButton === true) {
                    if (typeof fc.prevPages[fc.pageId] === "object") {
                        pageDiv += '<div class="fc-prev-page">';
                        pageDiv += '<input type="submit" value="' + fc.lang.prevButtonText + '" class="fc-btn">';
                        pageDiv += '</div>';
                    }
                }

                // Output the submit button
                pageDiv += '<div class="fc-submit">';
                pageDiv += '<input type="submit" value="' + submitText + '" class="fc-btn">';
                pageDiv += '</div>';
            }
        }

        pageDiv += '<div class="fc-break"></div></div>';

        // Close page div
        pageDiv += '</div>';

        return pageDiv;
    };

    /**
     * Flushses the visibility component of each section when the form state changes.
     */
    flushSectionVisibility = function () {
        $(fc.jQueryContainer).find('.fc-section').each(function () {
            var dataId = $(this).attr('formcorp-data-id'),
                section,
                visible;

            if (typeof dataId !== 'string' || dataId.length === 0 || typeof fc.sections[dataId] !== 'object') {
                return;
            }

            section = fc.sections[dataId];
            if (typeof section.visibility === 'string' && section.visibility.length > 0) {
                visible = eval(section.visibility);
                if (visible) {
                    $('div.fc-section[formcorp-data-id=' + dataId + ']').removeClass('fc-hide');
                } else {
                    $('div.fc-section[formcorp-data-id=' + dataId + ']').addClass('fc-hide');
                }
            }
        });
    };

    /**
     * Flushes the field visibility options. Should be triggered when the page is first rendered, and when a value
     * changes. A change in value represents a change in form state. When the form's state changes, the visibility of
     * certain fields may need to be altered.
     */
    flushFieldVisibility = function () {
        $(fc.jQueryContainer).find('.fc-field').each(function () {
            var dataId = $(this).attr('fc-data-group'),
                field,
                visible;

            if (typeof dataId !== 'string' || dataId.length === 0 || typeof fc.fieldSchema[dataId] !== 'object') {
                return;
            }

            // If field has a visibility configurative set, act on it
            field = fc.fieldSchema[dataId];
            if (typeof field.config.visibility === 'string' && field.config.visibility.length > 0) {
                visible = eval(toBooleanLogic(field.config.visibility));
                if (typeof visible === 'boolean') {
                    if (visible) {
                        $('div[fc-data-group="' + dataId + '"]').removeClass('fc-hide');
                    } else {
                        $('div[fc-data-group="' + dataId + '"]').addClass('fc-hide');
                    }
                }
            }
        });
    };

    /**
     * Flushes the visibility of various components throughout the form.
     */
    flushVisibility = function () {
        flushSectionVisibility();
        flushFieldVisibility();
    };

    /**
     * Update mobile fields
     */
    updateMobileFieldsVisibility = function () {
        $(fc.jQueryContainer).find('.fc-field.fc-mobile-field').each(function () {
            if (fc.mobileView === true && $(this).hasClass('fc-hide')) {
                $(this).removeClass('fc-hide');
            } else if (fc.mobileView === false && !$(this).hasClass('fc-hide')) {
                $(this).addClass('fc-hide');
            }
        });

        // Update desktop fields
        $(fc.jQueryContainer).find('.fc-field.fc-desktop-field').each(function () {
            if (fc.mobileView === true && !$(this).hasClass('fc-hide')) {
                $(this).addClass('fc-hide');
            } else if (fc.mobileView === false && $(this).hasClass('fc-hide')) {
                $(this).removeClass('fc-hide');
            }
        });

        flushVisibility();
        fc.inMobileView = fc.mobileView;
    };

    /**
     * Render a form stage
     * @param pageId
     * @param isNextPage
     */
    render = function (pageId, isNextPage) {
        // If expired, do not render anything
        if (fc.expired === true) {
            return;
        }

        var page = getPageById(pageId),
            html = '';

        // Ensure returned a valid page
        if (page === undefined) {
            console.log('FC Error: Page not found');
        }

        if (typeof page.stage !== 'object') {
            return;
        }

        // Store the previous page
        if (isNextPage === true && fc.currentPage !== undefined) {
            fc.prevPages[pageId] = getPageById(fc.currentPage);
        }

        fc.currentPage = pageId;

        // Store field schema locally
        updateFieldSchema(page.stage);

        html += renderPage(page);

        if (!fc.config.onePage) {
            // Show form in stages
            $(fc.jQueryContainer + ' .render').html(html);
        } else {
            $(fc.jQueryContainer + ' .render').append(html);
            fc.pageOrders.push(pageId);
            $(fc.jQueryContainer).find('.fc-pagination').hide();
            $(fc.jQueryContainer).find('.fc-pagination:last').show();
        }

        // Set values from data array
        setFieldValues();

        // Flush the field/section visibility
        flushVisibility();

        // Update the hash, and ignore the hash change event
        fc.ignoreHashChangeEvent = true;
        if (fc.config.updateHash) {
            window.location.hash = pageId;
        }

        // Update mobile visibility
        updateMobileFieldsVisibility();

        // Fire the event to signal form finished rendering
        $(fc.jQueryContainer).trigger(fc.jsEvents.onFinishRender);

        // Often various pages will be loaded at the same time (when no fields on that page are required)
        /*if (fc.config.autoLoadPages) {
         //checkAutoLoad();
         }*/
    };

    /**
     * Render the next page
     * @param shouldRender
     * @param returnPage
     * @param pageId
     * @returns {*}
     */
    nextPage = function (shouldRender, returnPage, pageId) {
        if (typeof shouldRender !== 'boolean') {
            shouldRender = true;
        }

        // By default, should return boolean value
        if (typeof returnPage !== 'boolean') {
            returnPage = false;
        }

        // If no page id specified, use the current page
        if (typeof pageId !== "string") {
            pageId = fc.currentPage;
        }

        var currentPage = getPageById(pageId),
            id,
            foundStage = false,
            x,
            condition,
            stage;

        if (!currentPage || !currentPage.page) {
            return;
        }

        // If have custom rules determining the page to navigate to, attempt to process them
        if (typeof currentPage.page.toCondition === 'object' && Object.keys(currentPage.page.toCondition).length > 0) {
            for (id in currentPage.page.toCondition) {
                if (currentPage.page.toCondition.hasOwnProperty(id)) {
                    condition = currentPage.page.toCondition[id];
                    if (eval(condition)) {
                        if (shouldRender) {
                            render(id, true);
                        }
                        return returnPage ? getPageById(id) : true;
                    }
                }
            }
        }

        // Render the next page by default (first page in next stage)
        for (x = 0; x < fc.schema.stage.length; x += 1) {
            stage = fc.schema.stage[x];

            // If the stage that is to be rendered has been found, do so
            /*jslint nomen: true*/
            if (foundStage && typeof stage.page === 'object' && stage.page.length > 0) {
                if (shouldRender) {
                    render(stage.page[0]._id.$id, true);
                }
                return returnPage ? getPageById(stage.page[0]._id.$id) : true;
            }
            /*jslint nomen: false*/

            // If the current iterative stage is the stage of the currently rendered page, mark the next stage to be rendered
            /*jslint nomen: true*/
            if (stage._id.$id === currentPage.stage._id.$id) {
                foundStage = true;
            }
            /*jslint nomen: false*/
        }

        return false;
    };

    /**
     * Auto loads the next page
     */
    checkAutoLoad = function () {
        if (!fc.config.autoLoadPages) {
            return;
        }

        // If a next page exists and the current page is valid, load the next page
        if (hasNextPage() && validForm('[data-page-id="' + fc.currentPage + '"]', false)) {
            loadNextPage(false);
            return true;
        }

        return false;
    };

    /**
     * Function that is fired when a data value changes.
     * @param dataId
     * @param value
     */
    valueChanged = function (dataId, value) {
        var fieldSchema = fc.fieldSchema[dataId],
            errors,
            params,
            dataParams,
            parentId,
            parentField,
            pageId,
            nextField,
            pageDataId,
            foundPage = false,
            loadedNextPage = false,
            allowAutoLoad,
            page,
            parts,
            iterator,
            field,
            linkedTo,
            prePopulate,
            tmp;

        // If unable to locate the field schema, do nothing (i.e. credit card field changes)
        if (fieldSchema === undefined) {
            return;
        }

        // If the field is linked to another field, try to update it
        // @todo: disable for now
        linkedTo = getConfig(fieldSchema, 'linkedTo', '');
        if (false && linkedTo.length > 0 && fc.fieldSchema[linkedTo] !== undefined) {
            valueChanged(linkedTo, value);
        }

        // If pre-populating other fields, do so now
        if (typeof value === 'string') {
            prePopulate = getConfig(fieldSchema, 'prePopulate', []);
            if ($.isArray(prePopulate) && prePopulate.length > 0) {
                for (iterator = 0; iterator < prePopulate.length; iterator += 1) {
                    tmp = prePopulate[iterator]; // The data id to prepopulate
                    if (fc.fields[tmp] === undefined || fc.fields[tmp].length === 0) {
                        fc.fields[tmp] = value;

                        // Queue the field to be updated on the serer
                        fc.saveQueue[tmp] = value;
                    }
                }
            }
        }

        // If the value hasn't actually changed, return
        if (fc.fields[dataId] && fc.fields[dataId] === value) {
            return;
        }

        $(fc.jQueryContainer).trigger(fc.jsEvents.onFieldValueChange, [dataId, value]);

        // Store when not a repeatable value
        if (!fieldIsRepeatable(dataId) && !fieldParentIsRepeatable(dataId)) {
            fc.fields[dataId] = value;

            // If a grouplet, save the original state of the grouplet
            if (dataId.indexOf(fc.constants.prefixSeparator) > -1) {
                saveOriginalGroupletValue(dataId, value);
            }

            // Flush the field visibility options
            flushVisibility();
        }

        // Store against array values when sub field (field_1, field_2) for a repeatable iterator
        if (dataId.indexOf(fc.constants.prefixSeparator) > -1) {
            parts = dataId.split(fc.constants.prefixSeparator);
            if (fc.fieldSchema[parts[0]] && fc.fieldSchema[parts[0]].type === 'repeatableIterator') {
                // Initialise the base field if required
                if (fc.fields[parts[0]] === undefined || !$.isArray(fc.fields[parts[0]])) {
                    fc.fields[parts[0]] = [];
                }

                field = fc.fields[parts[0]];

                for (iterator = 1; iterator < parts.length; iterator += 1) {
                    if (iterator === (parts.length - 1)) {
                        field[parts[iterator]] = value;
                    } else {
                        if (field[parts[iterator]] === undefined) {
                            field[parts[iterator]] = {};
                        }
                        field = field[parts[iterator]];
                    }
                }

                // Queue to be saved
                fc.saveQueue[parts[0]] = fc.fields[parts[0]];
            }
        }

        // Set the active page id to the page that the field belongs to, delete later pages
        fc.currentPage = getFieldPageId(dataId);
        $('.fc-page[data-page-id="' + fc.currentPage + '"] .fc-pagination').show();
        $('.fc-page').each(function () {
            pageDataId = $(this).attr('data-page-id');
            if (foundPage && pageDataId !== fc.currentPage) {
                $(this).remove();
            } else if (pageDataId === fc.currentPage) {
                foundPage = true;
            }
        });

        // Update the page orders
        if (fc.pageOrders.indexOf(fc.currentPage) !== fc.pageOrders.length - 1) {
            fc.pageOrders = fc.pageOrders.splice(0, fc.pageOrders.indexOf(fc.currentPage) + 1);
        }

        // If the item belongs to a repeatable object, do not store the changed value
        if (dataId.indexOf(fc.constants.prefixSeparator) > -1) {
            dataParams = dataId.split(fc.constants.prefixSeparator);
            parentId = dataParams[0];
            parentField = fc.fieldSchema[parentId];

            if (parentField !== undefined && getConfig(parentField, 'repeatable', false) === true) {
                errors = fieldErrors(dataId);
                if (fc.config.realTimeValidation === true) {
                    if (errors !== undefined && errors.length > 0) {
                        // Log the error event
                        logEvent(fc.eventTypes.onFieldError, {
                            fieldId: dataId,
                            errors: errors
                        });

                        showFieldError(dataId, errors);
                        return;
                    }

                    removeFieldError(dataId);
                }

                // Store the changed value for intermittent saving
                if (fc.config.saveInRealTime === true) {
                    fc.saveQueue[dataId] = value;
                }
                return;
            }
        }

        // Don't perform operations on repeatable fields
        if (!fieldIsRepeatable(dataId)) {
            fc.fields[dataId] = value;

            // Flush the field visibility options
            flushVisibility();

            // Check real time validation
            errors = fieldErrors(dataId);
            if (fc.config.realTimeValidation === true) {
                if (errors !== undefined && errors.length > 0) {
                    // Log the error event
                    logEvent(fc.eventTypes.onFieldError, {
                        fieldId: dataId,
                        errors: errors
                    });

                    showFieldError(dataId, errors);
                    return;
                }

                removeFieldError(dataId);
            }

            // Store the changed value for intermittent saving
            if (fc.config.saveInRealTime === true) {
                fc.saveQueue[dataId] = value;
            }

            // Need to get the next value field
            nextField = nextVisibleField(dataId);

            // Register the value changed event
            params = {
                fieldId: dataId,
                success: !errors || errors.length === 0
            };

            if (nextField) {
                params.nextField = nextField;
            }

            // If success, update the completion time
            if (params.success) {
                params.completionTime = (Date.now() - fc.lastCompletedTimestamp) / 1000;

                // If a hesitation time has been recorded, subtract it from the completion time
                if (fc.lastHesitationTime > 0) {
                    params.completionTime -= fc.lastHesitationTime;
                }

                // Update timestamps and mark the field as completed
                fc.lastCompletedField = dataId;
                fc.lastCompletedTimestamp = Date.now();
            }

            logEvent(fc.eventTypes.onValueChange, params);
        }

        // Check to see if the next page should be automatically loaded
        pageId = getFieldPageId(dataId);
        page = getPageById(pageId);
        allowAutoLoad = !page || !page.page || !page.page.preventAutoLoad || page.page.preventAutoLoad !== '1';

        if (fc.config.autoLoadPages) {
            if (pageId === fc.currentPage && allowAutoLoad) {
                // Pages have the option of opting out of autoloading
                loadedNextPage = checkAutoLoad();
            }
        }

        // Scroll to the next field if required
        if (getConfig(fc.fieldSchema[dataId], 'allowAutoScroll', true) && fc.config.autoScrollToNextField && !loadedNextPage && nextField && nextField.length > 0) {
            autoScrollToField(dataId, nextField);
        }
    };

    /**
     * Register event listeners that fire when a form input field's value changes
     */
    registerValueChangedListeners = function () {
        // On enter pressed, opt to shift focus
        if (fc.config.autoShiftFocusOnEnter) {
            $(fc.jQueryContainer).on('keypress', 'input[type=text].fc-fieldinput', function (e) {
                if (e.which === fc.constants.enterKey) {
                    var dataId = $(this).attr('formcorp-data-id'),
                        nextField = nextVisibleField(dataId, false),
                        nextFieldEl,
                        changedFocus = false,
                        val = $(this).val(),
                        id = $(this).attr('formcorp-data-id');

                    // If the field isn't valid, do nothing
                    if (!fieldIsValid(id, val)) {
                        return;
                    }

                    // If the next field is a text box, shift focus to it
                    if (nextField && nextField.length > 0) {
                        nextFieldEl = $('.fc-fieldinput[type=text][formcorp-data-id="' + nextField + '"]');
                        if (nextFieldEl.length > 0) {
                            nextFieldEl.focus();
                            changedFocus = true;
                        }
                    }

                    // Focus out if not
                    if (!changedFocus) {
                        $(this).blur();
                    }

                    // Mark the value as changed
                    if (val !== fc.fields[id]) {
                        // Only trigger when the value has truly changed
                        valueChanged(id, val);
                    }

                    // Auto scroll to next field if required
                    if (nextField && nextField.length > 0 && fc.config.autoScrollToNextField) {
                        autoScrollToField(dataId, nextField);
                    }
                }
            });
        }

        // Input types text changed
        $(fc.jQueryContainer).on('change', 'input[type=text].fc-fieldinput, input[type=radio].fc-fieldinput', function () {
            var val = $(this).val(),
                id = $(this).attr('formcorp-data-id'),
                schema = fc.fieldSchema[id],
                el;

            if (schema && schema.type && schema.type === 'abnVerification') {
                // Do not want to temporarily store ABN
                el = $(this).parent().find('.fc-button');

                if (val.length === 0 || fc.validAbns.indexOf(val) === -1) {
                    // If the abn hasn't previously been marked as valid, show the button

                    if (el.hasClass('fc-hide')) {
                        el.removeClass('fc-hide');
                    }
                } else {
                    // Otherwise ABN is known to be valid, mark as changed and remove possible errors
                    el.addClass('fc-hide');
                    valueChanged(id, val);
                    removeFieldError(id);
                }

                // Need to update the stored value to ensure proper validation
                fc.fields[id] = val;

                return;
            }

            if (val !== fc.fields[id]) {
                // Only trigger when the value has truly changed
                valueChanged(id, val);
            }
        });

        $(fc.jQueryContainer).on('change paste blur', '.fc-field-text input[type=text].fc-fieldinput', function () {
            var val = $(this).val(),
                id = $(this).attr('formcorp-data-id');

            if (val !== fc.fields[id]) {
                // Only trigger when the value has truly changed
                valueChanged(id, val);
            }
        });

        // Abn verification lookup
        $(fc.jQueryContainer).on('click', '.fc-field-abnVerification .fc-button', function () {
            var abn = $(this).parent().find('input.fc-fieldinput'),
                dataId = abn.attr('formcorp-data-id'),
                loading = abn.parent().find('.fc-loading'),
                btn = this,
                mapField;

            removeFieldError(dataId);
            if (loading && loading.length > 0) {
                loading.removeClass('fc-hide');
            }

            // Validate the ABN
            validateAbn(dataId, abn.val(), function (result) {
                var field, id, entityName, container;

                if (loading && loading.length > 0) {
                    loading.addClass('fc-hide');
                }

                if (typeof result === "object") {
                    if (result.success && [true, "true"].indexOf(result.success) > -1) {
                        mapField = getConfig(fc.fieldSchema[dataId], 'mapBusinessName', '');

                        // Set the business/entity name
                        if (mapField.length > 0 && result.entityName && result.entityName.length > 0) {
                            field = getFieldByTag(mapField);
                            if (field && field !== null && typeof field === "object") {
                                id = getId(field);
                                if (id.length > 0 && (!fc.fields[id] || (typeof fc.fields[id] === "string" && fc.fields[id].length === 0))) {
                                    // If an id is set, and the field doesn't exist, or the field is empty, set
                                    if (typeof result.businessName === "object" && result.businessName.length > 0) {
                                        entityName = result.businessName[0];
                                    } else {
                                        entityName = result.entityName;
                                    }

                                    fc.fields[id] = entityName;
                                    container = $('.fc-field[fc-data-group="' + id + '"]');
                                    setFieldValue(container, id);
                                }
                            }
                        }

                        fc.validAbns.push(abn.val());
                        $(btn).remove();
                        valueChanged(dataId, abn.val());
                    } else {
                        showFieldError(dataId, [result.message]);
                    }
                }
            });
            return false;
        });

        // Radio button clicks
        $(fc.jQueryContainer).on('click', 'button.fc-fieldinput.fc-button', function () {
            var val = $(this).text(),
                id = $(this).attr('formcorp-data-id'),
                parent = $(this).parent().parent(),
                fieldEl = $('.fc-field[fc-data-group="' + id + '"]'),
                alreadyChecked = $(this).hasClass('checked'),
                dataArray;

            // If the button has a data-field-value field, use it as the value
            if ($(this).attr('data-field-value')) {
                val = decodeURIComponent($(this).attr('data-field-value'));
            }

            // Reset the selected
            if (['contentRadioList', 'optionTable'].indexOf(fc.fieldSchema[id].type) > -1) {
                val = decodeURIComponent($(this).attr('data-field-value'));

                // If its a radio list, only allow one to be selected
                if (!getConfig(fc.fieldSchema[id], 'allowMultiple', false)) {
                    fieldEl.find('button.checked').removeClass('checked');
                } else {
                    // Checkbox list - allows multiple
                    dataArray = fc.fields[id] || [];
                    if (dataArray.indexOf(val) < 0) {
                        if (!alreadyChecked) {
                            // If the option hasn't been previously selected, add it
                            dataArray.push(val);
                        }
                    } else {
                        // Remove from element if already checked
                        if (alreadyChecked) {
                            delete dataArray[dataArray.indexOf(val)];
                        }
                    }

                    val = dataArray;
                }
            } else if (parent.hasClass('fc-radio-option-buttons')) {
                parent.find('.checked').removeClass('checked');
            }

            $(this).toggleClass('checked');
            valueChanged(id, val);

            return false;
        });

        // Dropdown box change
        $(fc.jQueryContainer).on('change', 'select.fc-fieldinput', function () {
            valueChanged($(this).attr('formcorp-data-id'), $(this).find('option:selected').val());
        });

        // Radio lists
        $(fc.jQueryContainer).on('change', '.fc-field-checkboxList :checkbox', function () {
            valueChanged($(this).attr('formcorp-data-id'), getFieldValue($(this)));
        });
    };

    /**
     * Attempts to validate the modal used for adding multi-value attributes.
     * @returns {boolean}
     */
    validateModal = function (showErrors) {
        var valid = true,
            fieldId,
            value,
            field,
            customErrors,
            errors = {};

        // Default to not show errors
        if (typeof showErrors !== 'boolean') {
            showErrors = false;
        }

        // Iterate through each field and validate
        $('.fc-modal [formcorp-data-id]').each(function () {
            // If field is not required, no need to run any validations on it
            if ($(this).attr('data-required') !== 'true') {
                return;
            }

            // If empty and required, return false
            if (fieldIsEmpty($(this))) {
                valid = false;
                return;
            }

            fieldId = $(this).attr('formcorp-data-id');
            value = getFieldValue($(this));
            field = fc.fieldSchema[fieldId];

            // If custom errors exist, return false
            customErrors = getCustomErrors(field, value);
            if (customErrors.length > 0) {
                valid = false;

                errors[fieldId] = customErrors;
                if (showErrors) {
                    showFieldError(fieldId, customErrors);
                }
            }
        });

        return valid;
    };

    /**
     * Show the delete dialog
     * @returns {boolean}
     */
    showDeleteDialog = function () {
        $('.fc-modal .modal-header h2').text(fc.lang.deleteDialogHeader);
        $('.fc-modal .modal-body').html(fc.lang.deleteSignatoryDialogText);
        $('.fc-modal .modal-footer .fc-btn-add').text(fc.lang.confirm);
        $('.fc-modal').addClass('fc-show');
        return false;
    };

    /**
     * Show the delete dialog
     * @returns {boolean}
     */
    showRepeatableEditDialog = function () {
        var html = $("<div />").append($('[fc-data-group="' + fc.modalMeta.fieldId + '"] > .fc-fieldcontainer').clone()),
            values = {},
            modalBody = $('.fc-modal .modal-body');

        // Remove repeatable classes (for validation purposes)
        html.find('.fc-data-repeatable-grouplet').removeClass('fc-data-repeatable-grouplet');

        // If values for this row exist, set
        if (fc.fields[fc.modalMeta.fieldId] && fc.fields[fc.modalMeta.fieldId][fc.modalMeta.index]) {
            values = fc.fields[fc.modalMeta.fieldId][fc.modalMeta.index];
        }

        $('.fc-modal .modal-header h2').text(fc.lang.editDialogHeader);

        // Set the modal body html and update the contents
        modalBody.html(html.html());
        modalBody.find('div[fc-data-group]').each(function () {
            var fieldId = $(this).attr('fc-data-group');
            if (values[fieldId] !== undefined) {
                setDomValue(this, values[fieldId]);
            }

        });

        $('.fc-modal .modal-footer .fc-btn-add').text(fc.lang.confirm);
        $('.fc-modal').addClass('fc-show');
        return false;
    };

    /**
     * Register the event listeners for repeatable grouplets
     */
    registerRepeatableGroupletListeners = function () {
        // Show delete dialog
        $(fc.jQueryContainer).on('click', '.fc-summary-options .fc-delete', function () {
            // Set the modal state
            fc.modalState = fc.states.DELETE_REPEATABLE;
            fc.modalMeta = {
                index: $(this).parent().attr('data-index'),
                fieldId: $(this).parent().attr('data-field-id')
            };

            showDeleteDialog();
            return false;
        });

        // Show edit dialog
        $(fc.jQueryContainer).on('click', '.fc-summary-options .fc-edit', function () {
            // Set the modal state
            fc.modalState = fc.states.EDIT_REPEATABLE;
            fc.modalMeta = {
                index: $(this).parent().attr('data-index'),
                fieldId: $(this).parent().attr('data-field-id')
            };

            showRepeatableEditDialog();

            return false;
        });
    };

    /**
     * Add a repeatable row through a modal dialog
     * @returns {boolean}
     */
    addRepeatableRow = function () {
        var validModal = validateModal(),
            values = {},
            modalBody = $('.fc-modal .modal-body > div');

        if (!validModal) {
            modalBody.addClass('fc-error');
            return false;
        }

        modalBody.removeClass('fc-error');

        // Build array of values
        $(fc.jQueryContainer).find('.fc-modal [formcorp-data-id]').each(function () {
            var dataId = $(this).attr('formcorp-data-id');
            values[dataId] = getFieldValue($(this));
        });

        // Add the values to the array
        if (typeof fc.fields[fc.activeModalField] !== 'object') {
            fc.fields[fc.activeModalField] = [];
        }

        // If not array, initialise as one
        if (!$.isArray(fc.fields[fc.activeModalField])) {
            fc.fields[fc.activeModalField] = [];
        }
        fc.fields[fc.activeModalField].push(values);

        $('[fc-data-group="' + fc.activeModalField + '"] .fc-summary').html(renderRepeatableTable(fc.activeModalField, fc.fields[fc.activeModalField]));

        // Set to null to signify no repeatable grouplet is being displayed
        hideModal();
    };

    /**
     * Handle the editing of a repeatable row
     */
    editRepeatableRow = function () {
        var selector = $('.fc-modal').find('.modal-body > .fc-fieldcontainer'),
            values = {},
            html;

        if (selector && selector.length > 0 && validateModal(true)) {
            // Build array of values
            $(fc.jQueryContainer).find('.fc-modal [formcorp-data-id]').each(function () {
                var dataId = $(this).attr('formcorp-data-id');
                values[dataId] = getFieldValue($(this));
            });

            // Add the values to the array
            if (typeof fc.fields[fc.activeModalField] !== 'object') {
                fc.fields[fc.activeModalField] = [];
            }

            if (fc.fields[fc.modalMeta.fieldId] && fc.fields[fc.modalMeta.fieldId][fc.modalMeta.index]) {
                fc.fields[fc.modalMeta.fieldId][fc.modalMeta.index] = values;

                // Update the save queue to send up to the server
                fc.saveQueue[fc.modalMeta.fieldId] = fc.fields[fc.modalMeta.fieldId];

                // Update the summary table and hide the modal
                html = renderRepeatableTable(fc.modalMeta.fieldId, fc.fields[fc.modalMeta.fieldId]);
                $('[fc-data-group="' + fc.modalMeta.fieldId + '"] .fc-summary').html(html);
                hideModal();
            }
        }
    };

    /**
     * Delete a repeatable row through a modal dialog
     */
    deleteRepeatableRow = function () {
        fc.fields[fc.modalMeta.fieldId].splice(fc.modalMeta.index, 1);
        fc.saveQueue[fc.modalMeta.fieldId] = fc.fields[fc.modalMeta.fieldId];

        // Set the html
        var html = renderRepeatableTable(fc.modalMeta.fieldId, fc.fields[fc.modalMeta.fieldId]);
        $('[fc-data-group="' + fc.modalMeta.fieldId + '"] .fc-summary').html(html);

        hideModal();
    };

    /**
     * Load the next page
     * @param showError
     * @returns {boolean}
     */
    loadNextPage = function (showError) {
        if (showError === undefined) {
            showError = true;
        }

        logEvent(fc.eventTypes.onNextPageClick);

        if (!validForm()) {
            logEvent(fc.eventTypes.onNextPageError);

            // Scroll to first error
            if (showError && fc.config.scrollOnSubmitError) {
                scrollToFirstError();
            }

            return false;
        }

        var formData = {},
            data,
            page,
            dataId,
            oldPage,
            newPage;

        // Build the form data array
        $('[formcorp-data-id]').each(function () {
            dataId = $(this).attr('formcorp-data-id');

            // If belongs to a grouplet, need to process uniquely - get the data id of the root grouplet and retrieve from saved field states
            if ($(this).hasClass('fc-data-repeatable-grouplet')) {
                if (formData[dataId] === undefined) {
                    formData[dataId] = fc.fields[dataId];
                }
            } else {
                // Regular fields can be added to the flat dictionary
                formData[dataId] = getFieldValue($(this));
                fc.fields[dataId] = formData[dataId];
            }
        });

        // Build the data object to send with the request
        data = {
            form_id: fc.formId,
            page_id: fc.pageId,
            form_values: formData
        };
        // Determine whether the application should be marked as complete
        page = nextPage(false, true);
        if ((page && typeof page.page === "object" && isSubmitPage(page.page)) || page === false) {
            data.complete = true;
        }

        // Submit the form fields
        $(fc.jQueryContainer).trigger(fc.jsEvents.onLoadingPageStart);
        $(fc.jQueryContainer).find('.fc-loading-screen').addClass('show');
        api('page/submit', data, 'put', function (data) {
            var lastPage,
                offset;

            if (typeof data.success === 'boolean' && data.success) {
                // Update activity (server last active timestamp updated)
                fc.lastActivity = (new Date()).getTime();
                $(fc.jQueryContainer).find('.fc-loading-screen').removeClass('show');
                $(fc.jQueryContainer).trigger(fc.jsEvents.onLoadingPageEnd);

                // If 'critical' errors were returned (validation errors on required fields), need to alert the user
                if (data.criticalErrors !== undefined && typeof data.criticalErrors === "object" && data.criticalErrors.length > 0) {
                    var x, field, sectionId, section, valid = false;
                    for (x = 0; x < data.criticalErrors.length; x += 1) {
                        field = $('.fc-field[fc-data-group="' + data.criticalErrors[x] + '"]');

                        // If the field exists and isn't hidden, user should not be able to proceed to next page (unless section invisible)
                        if (field.length > 0 && !field.hasClass('fc-hide')) {
                            sectionId = field.attr("fc-belongs-to");
                            section = $(fc.jQueryContainer).find('.fc-section[formcorp-data-id=' + sectionId + ']');

                            // If the section exists and is visible, do not proceed to the next stage
                            if (section.length > 0) {
                                if (!section.hasClass('fc-hide')) {
                                    return;
                                }
                                valid = true;
                            }

                            if (valid === false) {
                                console.log("[FC](1) Server side validation errors occurred, client should have caught this");
                                return;
                            }
                        }

                    }
                }

                // Render the next page if available
                if (hasNextPage()) {
                    oldPage = fc.currentPage;
                    nextPage();
                    newPage = fc.currentPage;

                    // Trigger the newpage event
                    $(fc.jQueryContainer).trigger(fc.jsEvents.onNextPage, [oldPage, newPage]);
                    $(fc.jQueryContainer).trigger(fc.jsEvents.onPageChange, [oldPage, newPage]);
                    logEvent(fc.eventTypes.onNextPageSuccess, {
                        from: oldPage,
                        to: newPage,
                        timeSpent: (Date.now() - fc.nextPageLoadedTimestamp) / 1000
                    });

                    fc.nextPageLoadedTimestamp = Date.now();

                    // If the application is complete, raise completion event
                    if (typeof page.page === "object" && isSubmitPage(page.page)) {
                        $(fc.jQueryContainer).trigger(fc.jsEvents.onFormComplete);
                        logEvent(fc.eventTypes.onFormComplete);
                    }

                    if (fc.nextPageButtonClicked && fc.config.onePage && fc.config.smoothScroll) {
                        lastPage = $('.fc-page:last');
                        if (lastPage && lastPage.length > 0) {
                            offset = parseInt(lastPage.offset().top, 10) + parseInt(fc.config.scrollOffset, 10);

                            // If at the top of the page, apply the initial offset
                            if ($(document).scrollTop() === 0) {
                                offset += fc.config.initialScrollOffset;
                            }

                            // Apply a conditional offset
                            if (fc.config.conditionalHtmlScrollOffset.class !== undefined) {
                                if ($('html').hasClass(fc.config.conditionalHtmlScrollOffset.class)) {
                                    offset += fc.config.conditionalHtmlScrollOffset.offset;
                                }
                            }

                            // Scroll to offset
                            scrollToOffset(offset);

                            fc.nextPageButtonClicked = false;
                        }
                    }

                    return;
                }

                // Form is deemed complete, output default completion message
                $(fc.jQueryContainer + ' .render').html(fc.lang.formCompleteHtml);
                $(fc.jQueryContainer).trigger(fc.jsEvents.onFormComplete);
                logEvent(fc.eventTypes.onFormComplete);
            } else {
                logEvent(fc.eventTypes.onNextPageError);
            }
        });
    };

    /**
     * Register event listeners specific for one page
     */
    registerOnePageListeners = function () {
        // When the user scrolls up/down, change the active page state depending on the offset
        $(document).on('scroll', function () {
            var iterator, offset, page, el;

            for (iterator = 0; iterator < fc.pageOrders.length; iterator += 1) {
                // Determine the offset of the page
                el = $('[data-page-id="' + fc.pageOrders[iterator] + '"]');
                if (el.length > 0) {
                    offset = parseInt($('[data-page-id="' + fc.pageOrders[iterator] + '"]').offset().top, 10);
                    offset += parseInt(fc.config.scrollOffset, 10) - fc.config.activePageOffset;

                    if ($(document).scrollTop() > offset) {
                        if (fc.activePage === undefined) {
                            fc.activePage = fc.pageOrders[iterator];
                        }

                        page = fc.pageOrders[iterator];
                    }
                }
            }

            // If a page was found and its different to the current page, fire off the change in state
            if (page !== undefined && fc.activePage !== page) {
                $(fc.jQueryContainer).trigger(fc.jsEvents.onPageChange, [fc.activePage, page]);
                fc.activePage = page;
            }
        });
    };

    /**
     * Register event listeners.
     */
    registerEventListeners = function () {
        // Submit a form page
        $(fc.jQueryContainer).on('click', 'div.fc-submit input[type=submit]', function () {
            // When true, loadNextPage() knows the page was submitted from clicking the button, and not automatically
            fc.nextPageButtonClicked = true;

            loadNextPage();
            return false;
        });

        // When the form is complete, delete the session
        if (fc.config.deleteSessionOnComplete) {
            $(fc.jQueryContainer).on(fc.jsEvents.onFormComplete, function () {
                deleteSession(false);
            });
        }

        // Previous page click
        $(fc.jQueryContainer).on('click', '.fc-prev-page', function () {
            if (fc.config.showPrevPageButton !== true) {
                return false;
            }

            $(fc.jQueryContainer).trigger(fc.jsEvents.onPrevPage);
            window.history.back();
            return false;
        });

        // Description link clicks
        $(fc.jQueryContainer).on('click', '.fc-desc a', function () {
            var href = $(this).attr('href');
            window.open(href);

            return false;
        });

        registerValueChangedListeners();

        // When the hash changes - navigate forward/backwards
        $(window).on('hashchange', function () {
            var pageId = window.location.hash.substr(1),
                page = $(fc.jQueryContainer).find('.fc-page[data-page-id="' + pageId + '"]');

            if (page.length === 0 && fc.ignoreHashChangeEvent === false && fc.oldHash !== pageId && typeof fc.pages[pageId] === 'object') {
                render(pageId);
            }

            // Smooth scroll
            if (fc.config.smoothScroll && fc.oldHash) {
                setTimeout(function (pageId) {
                    smoothScrollToPage(pageId);
                }.bind(this, pageId), fc.config.scrollWait);
            }

            fc.oldHash = pageId;
            fc.ignoreHashChangeEvent = false;
        });

        // Add value for a repeatable group
        $(fc.jQueryContainer).on('click', '.fc-repeatable a.fc-click', function () {
            var dataId = $(this).attr('data-id'),
                html = $("<div />").append($('[fc-data-group="' + dataId + '"] > .fc-fieldcontainer').clone()).html();

            // Set current active modal
            fc.activeModalField = dataId;
            fc.modalState = fc.states.ADD_REPEATABLE;

            $('.fc-modal .modal-body').html(html);
            $('.fc-modal').addClass('fc-show');

            return false;
        });

        // Help modal links
        $(fc.jQueryContainer).on('click', '.fc-help-link', function () {
            var dataIndex = $(this).attr('data-for');
            if (fc.helpData && fc.helpData[dataIndex]) {
                // Set modal information
                fc.modalState = fc.states.MODAL_TEXT;
                fc.modalMeta = {
                    body: fc.helpData[dataIndex]
                };

                // Show the modal
                showModal({
                    addButton: false,
                    body: fc.helpData[dataIndex],
                    title: fc.helpTitle[dataIndex]
                });
            }

            return false;
        });

        // Hide fc model
        $(fc.jQueryContainer).on('click', '.fc-modal .fc-btn-close', function () {
            $('.fc-modal.fc-show').removeClass('fc-show');
            return false;
        });

        // Add the value for the fc modal
        $(fc.jQueryContainer).on('click', '.fc-modal .fc-btn-add', function () {
            if (fc.modalState !== undefined && typeof fc.modalState === "string") {
                switch (fc.modalState) {
                    case fc.states.DELETE_REPEATABLE:
                        deleteRepeatableRow();
                        break;
                    case fc.states.ADD_REPEATABLE:
                        addRepeatableRow();
                        break;
                    case fc.states.EMAIL_VERIFICATION_CODE:
                        verifyEmailAddress();
                        break;
                    case fc.states.SMS_VERIFICATION_CODE:
                        verifyMobileNumber();
                        break;
                    case fc.states.EDIT_REPEATABLE:
                        editRepeatableRow();
                        break;
                }
            }

            return false;
        });

        registerRepeatableGroupletListeners();
        registerApiLookupListener();

        if (fc.config.onePage) {
            registerOnePageListeners();
        }

        // Register mobile browser detection based on screen size
        $(window).resize(function () {
            fc.mobileView = isMobile();
            if (fc.mobileView !== fc.inMobileView) {
                updateMobileFieldsVisibility();
            }
        });
    };

    /**
     * Calculates the HTML for the auto suggest functionality.
     * @param dataId
     * @param values
     * @param summaryTemplate
     * @returns {string}
     */
    renderAutoCompleteWidget = function (dataId, values, summaryTemplate) {
        if (!$.isArray(values)) {
            return '';
        }

        // Initialise variables
        var fieldContainer = $('.fc-field[fc-data-group="' + dataId + '"]'),
            html,
            iterator,
            counter,
            summary,
            tokens,
            re,
            templateTokens = summaryTemplate.match(/\{([a-zA-Z0-9\-\_]+)\}/g);

        // Replace the curly braces in the template tokens
        if (templateTokens.length === 0) {
            return;
        }

        for (iterator = 0; iterator < templateTokens.length; iterator += 1) {
            templateTokens[iterator] = templateTokens[iterator].replace(/[\{\}]/g, '');
        }

        if (fieldContainer.length === 0) {
            return '';
        }

        // Format the html
        html = '<div class="fc-auto-suggest" data-id="' + dataId + '">';
        html += '<div class="fc-suggest-close"><a href="#">x</a></div>';
        for (iterator = 0; iterator < values.length; iterator += 1) {
            tokens = values[iterator];

            // Replace the tokens in the summary template
            summary = summaryTemplate.slice(0);
            for (counter = 0; counter < templateTokens.length; counter += 1) {
                re = new RegExp('\{' + templateTokens[counter] + '\}', 'g');
                summary = summary.replace(re, tokens[templateTokens[counter]] !== undefined ? tokens[templateTokens[counter]] : '');
            }

            // Add to html
            html += '<div class="fc-suggest-row" data-suggest="' + encodeURI(JSON.stringify(tokens)) + '" data-id="' + dataId + '"><a href="#">' + summary + '</a></div>';
        }
        html += '</div>';

        return html;
    };

    /**
     * Removes an auto complete widget
     * @param dataId
     * @returns {boolean}
     */
    removeAutoCompleteWidget = function (dataId) {
        var fieldContainer = $('.fc-field[fc-data-group="' + dataId + '"]');

        if (fieldContainer.length === 0) {
            return false
        }

        fieldContainer.find('.fc-auto-suggest').remove();
    };

    /**
     * Register the API look up
     */
    registerApiLookupListener = function () {
        if (fc.registeredApiLookup === true) {
            return;
        }

        // Trigger an API look up
        $(fc.jQueryContainer).on('input paste', '.fc-field-apiLookup input[type=text].fc-fieldinput', function (event) {
            var fieldId = $(this).attr('formcorp-data-id'),
                fieldContainer = $('.fc-field[fc-data-group="' + fieldId + '"]'),
                schema = fc.fieldSchema[fieldId],
                value = $(this).val(),
                apiUrl,
                requestType,
                summary = getConfig(schema, 'responseSummary', ''),
                postData,
                request = {},
                gracePeriod,
                obj = this;

            // Fetch the grace period
            gracePeriod = parseInt(getConfig(schema, 'gracePeriod', -1));
            if (gracePeriod < 0) {
                removeAutoCompleteWidget(fieldId);
                return;
            }

            if (summary.length === 0) {
                removeAutoCompleteWidget(fieldId);
                return;
            }

            // Not enough characters to trigger an API lookup
            if (value.length < parseInt(getConfig(schema, 'minCharsBeforeTrigger', 1))) {
                removeAutoCompleteWidget(fieldId);
                return;
            }

            // Fetch the URL to send the request to
            apiUrl = getConfig(schema, 'apiUrl', '');
            if (apiUrl.length <= 0) {
                removeAutoCompleteWidget(fieldId);
                return;
            }

            // Fetch the request type
            requestType = getConfig(schema, 'requestType', 'GET');
            if (['GET', 'POST', 'PUT'].indexOf(requestType) < 0) {
                removeAutoCompleteWidget(fieldId);
                return;
            }
            request.type = requestType;

            // Attach post data
            if (['POST', 'PUT'].indexOf(requestType) >= 0) {
                postData = getConfig(schema, 'postData', '');
                if (postData.length > 0) {
                    postData = postData.replace(/<value>/g, encodeURIComponent(value));
                    request.data = postData;
                }
            }

            // Send off the request
            if (apiUrl.indexOf('<value>') >= 0) {
                apiUrl = apiUrl.replace(/<value>/g, encodeURIComponent(value));
            }

            // Format the request
            request.url = apiUrl;

            // Success function
            request.success = function (data) {
                if (data.length === 0) {
                    removeAutoCompleteWidget(fieldId);
                } else {
                    var html = renderAutoCompleteWidget(fieldId, data, summary),
                        existingAutoSuggest = fieldContainer.find('.fc-auto-suggest');

                    // Delete the existing auto suggest if it exists
                    if (existingAutoSuggest.length > 0) {
                        existingAutoSuggest.remove();
                    }

                    fieldContainer.find('.fc-fieldgroup').append(html);
                }
            };

            setTimeout(function () {
                // If the value has changed inside of the grace period, return
                var newValue = getFieldValue($(obj));
                if (newValue !== value) {
                    return;
                }

                $.ajax(request);
            }, gracePeriod);
        });

        // Close the suggest box
        $(fc.jQueryContainer).on('click', '.fc-suggest-close a', function () {
            var dataId = $(this).parent().parent().attr('data-id');
            removeAutoCompleteWidget(dataId);

            return false;
        });

        // Map the fields on click
        $(fc.jQueryContainer).on('click', '.fc-suggest-row', function () {
            var json = JSON.parse(decodeURI($(this).attr('data-suggest'))),
                dataId = $(this).attr('data-id'),
                schema = fc.fieldSchema[dataId],
                map = getConfig(schema, 'mapResponse', '{}'),
                mapObj,
                tags,
                tag,
                tagId,
                val,
                tokens,
                iterator,
                token,
                replacement,
                re,
                domObj;

            if (typeof json !== 'object') {
                return false;
            }

            // Attempt to decode to JSON object
            try {
                mapObj = JSON.parse(map);
            } catch (ignore) {
                return false;
            }

            // Retrieve field tags and perform replacement=
            tags = getFieldTags(true);
            for (tag in mapObj) {
                if (mapObj.hasOwnProperty(tag)) {
                    if (tags[tag] !== undefined) {
                        tagId = tags[tag];

                        domObj = $('.fc-field[fc-data-group="' + tagId + '"');

                        if (domObj.length > 0) {
                            // Perform the token replacement on the mapped value
                            val = mapObj[tag];
                            tokens = val.match(/\{([a-zA-Z0-9\-\_]+)\}/g);

                            // Replace each token
                            if (tokens.length > 0) {
                                for (iterator = 0; iterator < tokens.length; iterator += 1) {
                                    token = tokens[iterator].replace(/[\{\}]/g, '');
                                    re = new RegExp('\{' + token + '\}', 'g');
                                    replacement = json[token] !== undefined ? json[token] : '';
                                    val = val.replace(re, replacement);
                                }
                            }

                            // Set the field value in the DOM
                            fc.fields[tagId] = val;
                            fc.saveQueue[tagId] = val;
                            setDomValue(domObj, val);
                        }
                    }
                }
            }

            removeAutoCompleteWidget(dataId);

            return false;
        });

        fc.registeredApiLookup = true;
    };

    /**
     * Generates a random string of length $length
     *
     * @param length
     * @returns {string}
     */
    generateRandomString = function (length) {
        var str = '',
            chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
            x;

        for (x = 0; x < length; x += 1) {
            str += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        return str;
    };

    /**
     * Register the formcorp css files
     */
    loadCssFiles = function () {
        var cssId = 'formcorp-css',
            cssUri = 'formcorp.css',
            iterator;

        if ($('#' + cssId).length === 0) {
            loadCssFile(cdnUrl + cssUri);
        }

        $(fc.jQueryContainer).addClass('fc-container');
        addModalWindow();
        $(fc.jQueryContainer).prepend('<div class="fc-loading-screen"><div class="fc-loading-halo"></div></div>');

        // Load the required css files
        for (iterator = 0; iterator < fc.config.signatureLibCss.length; iterator += 1) {
            loadCssFile(fc.config.signatureLibCss[iterator]);
        }

        // Load the required js files
        for (iterator = 0; iterator < fc.config.signatureLibJs.length; iterator += 1) {
            loadJsFile(fc.config.signatureLibJs[iterator]);
        }

        fc.renderedSignatures = {};
    };

    /**
     * Add a modal window to the page
     */
    addModalWindow = function () {

        if ($('#fc-modal').length > 0) {
            return;
        }

        var modal = '<div class="fc-modal" id="fc-modal" aria-hidden="true">' +
            '<div class="modal-dialog">' +
            '<div class="modal-header">' +
            '<h2>' + fc.lang.addModalHeader + '</h2>' +
            '</div>' +
            '<div class="modal-body">' +
            '<p>One modal example here! :D</p>' +
            '</div>' +
            '<div class="modal-footer">' +
            '<div class="fc-loading fc-hide"></div>' +
            '<div class="fc-error fc-hide"></div>' +
            '<a href="#" class="btn btn-danger fc-btn-close">' + fc.lang.closeModalText + '</a> ' +
            '<a href="#" class="btn btn-success fc-btn-add">' + fc.lang.addModalText + '</a> ' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>';


        $(fc.jQueryContainer).prepend($(modal));
    };

    /**
     * Order schema numerically by data columns.
     * @param schema
     * @param orderColumn
     * @returns {*}
     */
    orderSchema = function (schema, orderColumn) {
        if (orderColumn === undefined) {
            orderColumn = 'order';
        }

        if (typeof schema === 'object') {
            var key;
            // Recursively order children
            for (key in schema) {
                if (schema.hasOwnProperty(key)) {
                    // Chilcren have order, try to order the object
                    if (!!schema[key] && typeof schema[key] === 'object' && schema[key][0] !== undefined && !!schema[key][0] && schema[key][0].order !== undefined) {
                        schema[key] = orderObject(schema[key]);
                    } else {
                        schema[key] = orderSchema(schema[key], orderColumn);
                    }
                }
            }
        }

        return schema;
    };

    /**
     * Orders an object numerically in ascending order by a given data column.
     * @param object
     * @returns {Array}
     */
    orderObject = function (object) {
        // Construct a 2-dimensional array (so pages with same order don't override each other)
        var orderedObject = [],
            key,
            order,
            objects = [],
            x;

        for (key in object) {
            if (object.hasOwnProperty(key)) {
                order = object[key].order !== undefined ? object[key].order : 0;
                if (orderedObject[order] === undefined) {
                    orderedObject[order] = [];
                    orderedObject[order].push(object[key]);
                }
            }
        }

        // Flatten the two-dimensional array in to a single array
        for (key in orderedObject) {
            if (orderedObject.hasOwnProperty(key)) {
                for (x = 0; x < orderedObject[key].length; x += 1) {
                    objects.push(orderedObject[key][x]);
                }
            }
        }

        return objects;
    };

    /**
     * Prune fields not on a current page
     * @param page
     * @param fields
     * @returns {{}}
     */
    pruneNonPageFields = function (page, fields) {
        var pageFields = [], section, x, y, field, obj = {};

        if (typeof page.page === "object" && typeof page.page.section === "object") {
            for (x = 0; x < page.page.section.length; x += 1) {
                section = page.page.section[x];
                if (typeof section.field === "object" && section.field.length > 0) {
                    for (y = 0; y < section.field.length; y += 1) {
                        field = section.field[y];
                        /*jslint nomen: true*/
                        pageFields.push(field._id.$id);
                        if (fields[field._id.$id] !== undefined) {
                            obj[field._id.$id] = fields[field._id.$id];
                        } else {
                            obj[field._id.$id] = "";
                        }
                        /*jslint nomen: false*/
                    }
                }
            }
        }

        return obj;
    };

    /**
     * Remove the fields from invisible sections from a data object (not DOM)
     * @param page
     * @param fields
     * @returns {*}
     */
    removeInvisibleSectionFields = function (page, fields) {
        var section, x, y, visible, field;

        if (typeof page.page === "object" && typeof page.page.section === "object") {
            for (x = 0; x < page.page.section.length; x += 1) {
                section = page.page.section[x];

                if (typeof section.visibility === 'string' && section.visibility.length > 0) {
                    visible = eval(section.visibility);
                    if (!visible) {
                        if (typeof section.field === "object" && section.field.length > 0) {
                            for (y = 0; y < section.field.length; y += 1) {
                                field = section.field[y];
                                /*jslint nomen: true*/
                                delete fields[field._id.$id];
                                /*jslint nomen: false*/
                            }
                        }
                    }
                }
            }
        }

        return fields;
    };

    /**
     * Remove invisible fields from an object
     * @param fields
     * @returns {*}
     */
    pruneInvisibleFields = function (fields) {
        if (typeof fields === "object") {
            var dataId, field, visible, json;

            for (dataId in fields) {
                if (fields.hasOwnProperty(dataId)) {
                    field = fc.fieldSchema[dataId];
                    if (field === undefined) {
                        continue;
                    }

                    // If mobile only field and not mobile
                    if (getConfig(field, 'mobileOnly', false) && !fc.mobileView) {
                        delete fields[dataId];
                        continue;
                    }

                    // If desktop only field and not desktop
                    if (getConfig(field, 'desktopOnly', false) && fc.mobileView) {
                        delete fields[dataId];
                        continue;
                    }

                    // If custom visibility rules
                    if (typeof field.config.visibility === 'string' && field.config.visibility.length > 0) {
                        // Attempt to convert to json string
                        if (['[', '{'].indexOf(field.config.visibility.substring(0, 1)) > -1) {
                            try {
                                json = $.parseJSON(field.config.visibility);
                                field.config.visibility = toBooleanLogic(json);
                            } catch (ignore) {
                            }
                        }

                        // Try to evaluate the boolean condition
                        try {
                            visible = eval(field.config.visibility);
                            if (typeof visible === 'boolean') {
                                if (!visible) {
                                    delete fields[dataId];
                                }
                            }
                        } catch (ignore) {
                        }
                    }
                }
            }
        }

        return fields;
    };

    /**
     * Returns true if a field is valid.
     * @param dataId
     * @param value
     * @returns {boolean}
     */
    fieldIsValid = function (dataId, value) {
        var schema,
            customErrors,
            id,
            iterator,
            grouplet,
            val,
            visible,
            defaultValue;

        // Can pass through either an id to retrieve the schema, or the schema itself
        try {
            if (typeof dataId === "string") {
                schema = fc.fieldSchema[dataId];
            } else if (typeof dataId === "object") {
                schema = dataId;
                dataId = getId(schema);
            }

            if (typeof schema !== "object") {
                return true;
            }
        } catch (ignore) {
        }

        // If the field isn't visible, return true - it doesn't matter what the value is
        if (getConfig(schema, 'visibility', false) !== false) {
            // Try to evaluate the boolean condition
            try {
                visible = eval(schema.config.visibility);
                if (typeof visible === 'boolean') {
                    if (!visible) {
                        return true;
                    }
                }
            } catch (ignore) {
            }
        }

        // Return false if required and empty
        if (schema.config !== undefined && schema.config.required !== undefined) {
            if (schema.config.required && value === "") {
                // Check for a default value - if set, mark as true, since a default indicates true regardless
                defaultValue = getConfig(schema, 'defaultValue', '');
                if (typeof defaultValue === 'string' && defaultValue.length > 0) {
                    return true;
                }

                return false;
            }
        }

        // If a grouplet, need to check each field within
        if (schema.type === "grouplet" && !getConfig(schema, "repeatable", false)) {
            grouplet = getConfig(schema, 'grouplet', {});
            if (grouplet.field !== undefined && typeof grouplet.field === "object" && grouplet.field.length > 0) {
                for (iterator = 0; iterator < grouplet.field.length; iterator += 1) {
                    /*jslint nomen:true*/
                    id = dataId + fc.constants.prefixSeparator + grouplet.field[iterator]._id.$id;
                    /*jslint nomen:false*/
                    val = (fc.fields[id] !== undefined) ? fc.fields[id] : "";
                    if (!fieldIsValid(grouplet.field[iterator], val)) {
                        return false;
                    }
                }
            }

            return true;
        }

        // Check custom validators
        customErrors = getCustomErrors(schema, value);
        return customErrors.length === 0;
    };

    /**
     * Iterates through an object of dataId=>value pairs to determine if fields are valid.
     *
     * @param fields
     * @returns {boolean}
     */
    formFieldsValid = function (fields) {
        if (typeof fields !== "object") {
            return true;
        }

        var dataId;

        for (dataId in fields) {
            if (fields.hasOwnProperty(dataId)) {
                if (!fieldIsValid(dataId, fields[dataId])) {
                    return false;
                }
            }
        }

        return true;
    };

    /**
     * Get the id of the first page on the form
     * @returns {*}
     */
    getFirstPageId = function () {
        var iterator;

        // If a channel is supplied, try to load the channel page first
        if (fc.channel && typeof fc.channel === 'string' && fc.channel.length > 0 && fc.schema.channel && $.isArray(fc.schema.channel) && fc.schema.channel.length > 0) {
            for (iterator = 0; iterator < fc.schema.channel.length; iterator += 1) {
                if (fc.schema.channel[iterator].name && fc.schema.channel[iterator].name === fc.channel) {
                    /*jslint nomen: true*/
                    return fc.schema.channel[iterator].default;
                    /*jslint nomen: false*/
                }
            }
        }

        // Default to first page on form
        /*jslint nomen: true*/
        return fc.schema.stage[0].page[0]._id.$id;
        /*jslint nomen: false*/
    };

    /**
     * Retrieve the first page (if the user has an active session, the opening page might be later on in the process)
     * @returns {*}
     */
    getFirstPage = function () {
        var id = getFirstPageId(),
            page,
            nextPageObj,
            fields,
            valid,
            allowAutoLoad,
            continueLoading = false;

        // Iterate through the pages until we come to one that isn't valid (meaning this is where our progress was)
        do {
            page = getPageById(id);
            if (page === undefined) {
                console.log('FC Error: Page not found');
                break;
            }

            if (typeof page.stage !== 'object') {
                break;
            }
            fc.currentPage = id;

            if (fc.config.updateHash) {
                window.location.hash = id;
            }

            // Store field schema locally
            updateFieldSchema(page.stage);
            fields = pruneNonPageFields(page, fc.fields);
            fields = removeInvisibleSectionFields(page, fields);
            fields = pruneInvisibleFields(fields);
            valid = formFieldsValid(fields);

            // Whether to continue loading or not
            continueLoading = valid && !isSubmitPage(page.page);

            // If using a one page form structure, output
            if (fc.config.onePage) {
                render(id);
            }

            // On page load, ignore the autoLoad flag (if user is directed back to this form, need to continue loading until pretty late)
            if (continueLoading) {
                nextPageObj = nextPage(false, true);
                // @todo problem here - why we cant go back
                if (nextPageObj !== undefined && typeof nextPageObj === "object") {
                    /*jslint nomen: true*/
                    id = nextPageObj.page._id.$id;
                    /*jslint nomen: false*/
                    fc.prevPages[id] = page;

                    // If next page is a submit page, do not render it
                    if (isSubmitPage(nextPageObj.page) === true) {
                        valid = false;
                        break;
                    }
                } else {
                    valid = false;
                    break;
                }
            }
        } while (continueLoading);

        return id;
    };

    /**
     * Load form settings from the server
     * @param callback
     */
    loadSettings = function (callback) {
        api('form/settings', {}, 'post', function (data) {
            if (typeof data === 'object') {
                fc.settings = data;
            }

            callback();
        });
    };

    /**
     * Load the form schema/definition
     */
    loadSchema = function () {
        // Send off the API call
        api('form/schema', {}, 'post', function (data) {
            if (typeof data.error === 'boolean' && data.error) {
                console.log('FC Error: ' + data.message);
                return;
            }

            var key, firstPageId;

            if (data && data.stage) {
                setFieldSchemas(data.stage);
            }

            // If data returned by the API server, set locally
            if (typeof data.data === 'object' && Object.keys(data.data).length > 0) {
                for (key in data.data) {
                    if (data.data.hasOwnProperty(key)) {
                        fc.fields[key] = data.data[key];

                        // If an ABN field, assume valid if previously set
                        if (fc.fieldSchema[key] && fc.fieldSchema[key].type && fc.fieldSchema[key].type === 'abnVerification' && fc.fields[key].length > 0) {
                            fc.validAbns.push(fc.fields[key]);
                        }

                        // If a grouplet, also store the entire state
                        if (key.indexOf(fc.constants.prefixSeparator) > -1) {
                            saveOriginalGroupletValue(key, data.data[key]);
                        }
                    }
                }
            }

            // Render the opening page for the form
            if (data.stage !== undefined) {
                fc.schema = orderSchema(data);
                if (typeof fc.schema.stage === 'object' && fc.schema.stage.length > 0 && typeof fc.schema.stage[0].page === 'object' && fc.schema.stage[0].page.length > 0) {
                    firstPageId = getFirstPage();

                    // If one page layout, getFirstPage() already rendered
                    if (!fc.config.onePage) {
                        render(firstPageId);
                    }
                }
            }

            $(fc.jQueryContainer).trigger(fc.jsEvents.onConnectionMade);

            // Initialise the on schema loaded event
            onSchemaLoaded();
        });
    };

    /**
     * Process the save queue
     */
    processSaveQueue = function () {
        if (fc.config.saveInRealTime !== true) {
            return;
        }

        // Terminate if already running
        if (fc.saveQueueRunning === true) {
            console.log('[FC] Save queue is already running (slow server?)');
            return;
        }

        // Terminate if nothing to do
        if (Object.keys(fc.saveQueue).length === 0) {
            return;
        }

        // Store value locally, so we can remove later
        fc.saveQueueRunning = true;
        var temporaryQueue = fc.saveQueue,
            data = {
                form_id: fc.formId,
                page_id: fc.pageId,
                form_values: temporaryQueue
            };

        // Fire off the API call
        api('page/submit', data, 'put', function (data) {
            var key;
            if (typeof data === "object" && data.success === true) {
                // Update activity (server last active timestamp updated)
                fc.lastActivity = (new Date()).getTime();

                // Delete values from the save queue
                for (key in temporaryQueue) {
                    if (temporaryQueue.hasOwnProperty(key)) {
                        if (typeof fc.saveQueue[key] === "string" && fc.saveQueue[key] === temporaryQueue[key]) {
                            delete fc.saveQueue[key];
                        }
                    }
                }
            }

            fc.saveQueueRunning = false;
        });
    };

    return {

        /**
         * Initialise the formcorp object.
         * @param publicKey
         * @param container
         */
        init: function (publicKey, container) {
            this.publicKey = publicKey;
            this.container = container;
            this.jQueryContainer = '#' + container;

            // Temporary placeholders for objects to be populated
            this.fields = {};
            this.fieldSchema = {};
            this.sections = {};
            this.pages = {};
            this.saveQueueRunning = false;
            this.saveQueue = {};
            this.prevPages = {};
            this.lastActivity = (new Date()).getTime();
            this.expired = false;
            this.pageOrders = [];
            this.activeScroll = "";
            this.processedActions = {};
            this.analytics = false;
            this.lastCompletedField = '';
            this.lastCompletedTimestamp = Date.now();
            this.lastHesitationTime = -1;
            this.nextPageLoadedTimestamp = Date.now();
            this.nextPageButtonClicked = false;
            this.validAbns = [];
            this.mobileView = isMobile();

            // Track which fields belong to which grouplets
            this.fieldGrouplets = {};

            /**
             * Modal states
             * @type {{DELETE_REPEATABLE: string, ADD_REPEATABLE: string, EDIT_REPEATABLE: string, EMAIL_VERIFICATION_CODE: string, SMS_VERIFICATION_CODE: string, MODAL_TEXT: string}}
             */
            this.states = {
                DELETE_REPEATABLE: 'deleteRepeatable',
                ADD_REPEATABLE: 'addRepeatableRow',
                EDIT_REPEATABLE: 'editRepeatableRow',
                EMAIL_VERIFICATION_CODE: 'emailVerificationCode',
                SMS_VERIFICATION_CODE: 'smsVerificationCode',
                MODAL_TEXT: 'modalText'
            };

            /**
             * Event types
             * @type {{onFieldInit: string, onFocus: string, onBlur: string, onValueChange: string, onNextStage: string, onFormInit: string, onMouseDown: string, onFieldError: string, onNextPageClick: string, onNextPageSuccess: string, onNextPageError: string, onFormComplete: string}}
             */
            this.eventTypes = {
                onFieldInit: 'onFieldInit',
                onFocus: 'onFocus',
                onBlur: 'onBlur',
                onValueChange: 'onValueChange',
                onNextStage: 'onNextStage',
                onFormInit: 'onFormInit',
                onMouseDown: 'onMouseDown',
                onFieldError: 'onFieldError',
                onNextPageClick: 'onNextPageClick',
                onNextPageSuccess: 'onNextPageSuccess',
                onNextPageError: 'onNextPageError',
                onFormComplete: 'onFormComplete'
            };

            /**
             * JS events
             * @type {{onFormInit: string, onFormExpired: string, onValidationError: string, onFormComplete: string, onNextPage: string, onPageChange: string, onPrevPage: string, onConnectionMade: string, onFinishRender: string, onFieldError: string, onFieldSuccess: string, onAnalyticsLoaded: string, onFieldValueChange: string, onLoadingPageStart: string, onLoadingPageEnd: string}}
             */
            this.jsEvents = {
                onFormInit: 'OnFcInit',
                onFormExpired: 'onFormExpired',
                onValidationError: 'onValidationError',
                onFormComplete: 'onFormComplete',
                onNextPage: 'onNextPage',
                onPageChange: 'onPageChange',
                onPrevPage: 'onPrevPage',
                onConnectionMade: 'onFCConnectionMade',
                onFinishRender: 'onFinishFormRender',
                onFieldError: 'onFieldError',
                onFieldSuccess: 'onFieldSuccess',
                onAnalyticsLoaded: 'onAnalyticsLoaded',
                onFieldValueChange: 'onFieldValueChange',
                onLoadingPageStart: 'onLoadingPageStart',
                onLoadingPageEnd: 'onLoadingPageEnd',
                onGreenIdLoaded: 'onGreenIdLoaded',
            };

            /**
             * One time processes
             * @type {{emailListeners: string, smsListeners: string, creditCardListeners: string}}
             */
            this.processes = {
                emailListeners: 'emailListeners',
                smsListeners: 'smsListeners',
                creditCardListeners: 'creditCardListeners',
                loadSignatureLibs: 'loadSignatureLibs'
            };

            /**
             * Constants
             * @type {{enterKey: number, prefixSeparator: string, tagSeparator: string, configKeys: {summaryLayout: string}, persistentSessions: string, defaultChannel: string}}
             */
            this.constants = {
                enterKey: 13,
                prefixSeparator: '_',
                tagSeparator: '.',
                configKeys: {
                    summaryLayout: 'summaryLayout'
                },
                persistentSessions: 'persistentSessions',
                defaultChannel: 'master',
                greenId: {
                    scriptPath: 'lib/green-id.js'
                }
            };

            /**
             * Payment environments
             * @type {{live: string, sandbox: string}}
             */
            this.environments = {
                live: "Live",
                sandbox: "Sandbox"
            };

            /**
             * Payment gateways
             * @type {{paycorp: {method: string, action: string}}}
             */
            this.gateways = {
                paycorp: {
                    method: 'POST',
                    action: {
                        sandbox: 'https://test-merchants.paycorp.com.au/paycentre3/makeEntry',
                        live: 'https://merchants.paycorp.com.au/paycentre3/makeEntry'
                    }
                }
            };

            /**
             * Credit card types
             * @type {{visa: string, mastercard: string, amex: string}}
             */
            this.cardTypes = {
                visa: 'visa',
                mastercard: 'mastercard',
                amex: 'amex'
            };

            // Set config if not already done so
            if (fc.config === undefined) {
                this.setConfig();
            }

            // Set language if not already done so
            if (fc.lang === undefined) {
                this.setLanguage();
            }

            // Set the default channel
            if (fc.channel === undefined) {
                fc.channel = fc.constants.defaultChannel;
            }

            // Check to make sure container exists
            $(document).ready(function () {
                // Analyse analytics if required
                if (fc.config.analytics === true || (typeof fc.config.analytics === "string" && fc.config.analytics.length > 0)) {
                    initAnalytics();
                }

                if ($(fc.jQueryContainer).length === 0) {
                    return false;
                }

                // Fetch the form id
                if ($(fc.jQueryContainer).attr('data-id') === '') {
                    return false;
                }
                fc.formId = $(fc.jQueryContainer).attr('data-id');

                // Attempt to load the settings from the server
                loadSettings(function () {
                    // Set the session id
                    fc.initSession();

                    // Initialise the channel on the root element
                    if (!$(fc.jQueryContainer).hasClass('fc-channel')) {
                        $(fc.jQueryContainer).addClass('fc-channel fc-channel-' + fc.channel)
                    }

                    // Register event listeners and load the form schema
                    $(fc.jQueryContainer).html('<div class="render"></div>');
                    loadCssFiles();
                    registerEventListeners();
                    loadSchema();

                    // Form has been successfully initialised
                    fc.formPosition = $(fc.jQueryContainer).position();
                    logEvent(fc.eventTypes.onFormInit);
                    $(fc.jQueryContainer).trigger(fc.jsEvents.onFormInit);

                    // Save form fields intermittently
                    if (fc.config.saveInRealTime === true) {
                        setInterval(function () {
                            processSaveQueue();
                        }, fc.config.saveInRealTimeInterval);
                    }

                    // Check if the user needs to be timed out
                    if (fc.config.timeUserOut) {
                        setInterval(function () {
                            if (fc.expired === true) {
                                return;
                            }

                            timeout();
                        }, 5000);
                    }
                });
            });
        },

        /**
         * Return the CDN url
         * @returns {string}
         */
        getCdnUrl: function () {
            return cdnUrl;
        },

        /**
         * Return the API function
         */
        api: api,

        /**
         * Retrieves the field config for a given key name
         */
        getConfig: getConfig,

        /**
         * Retrieve the id for a form field
         */
        getId: getId,

        /**
         * Retrieve a URL parameter by name
         * @param name
         * @returns {string}
         */
        getUrlParameter: function (name) {
            name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
            var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
                results = regex.exec(location.search);
            return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
        },

        /**
         * Set the form branch to use.
         * @param branch
         */
        setBranch: function (branch) {
            this.branch = branch;
        },

        /**
         * Set the channel
         * @param channel
         */
        setChannel: function (channel) {
            this.channel = channel;
        },

        /**
         * Set the session id
         * @param sessionId
         */
        setSessionId: function (sessionId) {
            this.sessionId = sessionId;
        },

        /**
         * Set class config values.
         * @param data
         */
        setConfig: function (data) {
            var eventQueueDefault = 8000,
                realTimeSaveDefault = 6000,
                key;

            // Default values
            this.config = {
                analytics: true,
                realTimeValidation: true,
                inlineValidation: true,
                sessionKeyLength: 40,
                sessionIdName: 'fcSessionId',
                eventQueueInterval: eventQueueDefault,
                saveInRealTime: true,
                saveInRealTimeInterval: realTimeSaveDefault,
                showPrevPageButton: true,
                timeUserOut: false,
                timeOutWarning: 870, // 14 minutes 30 seconds
                timeOutAfter: 900, // 15 minutes,
                cvvImage: null,
                onePage: false,
                smoothScroll: false,
                scrollDuration: 1000,
                scrollOnSubmitError: false,
                scrollWait: 500,
                initialScrollOffset: 0,
                scrollOffset: 0,
                conditionalHtmlScrollOffset: {},
                autoLoadPages: false,
                autoScrollToNextField: false,
                activePageOffset: 250,
                creditCardNumberLimits: [16, 16],
                maxCreditCardCodeLength: 4,
                descriptionBeforeLabel: true,
                creditCardErrorUrlParam: 'creditCardError',
                signatureLibCss: [
                    cdnUrl + 'dist/signaturepad/assets/jquery.signaturepad.css'
                ],
                signatureLibJs: [
                    cdnUrl + 'dist/signaturepad/jquery.signaturepad.min.js',
                    cdnUrl + 'dist/signaturepad/assets/flashcanvas.js',
                    cdnUrl + 'dist/signaturepad/assets/json2.min.js'
                ],
                signatureClass: 'sigPad',
                updateHash: true,
                deleteSessionOnComplete: true,
                autoShiftFocusOnEnter: false,
                minSizeForMobile: 479,
                helpAsModal: false
            };

            // Minimum event queue interval (to prevent server from getting slammed)
            if (this.config.eventQueueInterval < eventQueueDefault) {
                this.config.eventQueueInterval = eventQueueDefault;
            }

            // Minimum interval for real time saving (to prevent server from getting harrassed)
            if (this.config.saveInRealTimeInterval < realTimeSaveDefault) {
                this.config.saveInRealTimeInterval = realTimeSaveDefault;
            }

            // Update with client options
            if (typeof data === 'object' && Object.keys(data).length > 0) {
                for (key in data) {
                    if (data.hasOwnProperty(key)) {
                        fc.config[key] = data[key];
                    }
                }
            }
        },

        fieldErrors: fieldErrors,

        /**
         * Set the language data values
         * @param data
         */
        setLanguage: function (data) {
            var key;

            // Initialise the language
            this.lang = {
                prevButtonText: 'Previous',
                submitText: "Next",
                submitFormText: "Submit application",
                formCompleteHtml: '<h2 class="fc-header">Your application is complete</h2><p>Congratulations, your application has successfully been completed. Please expect a response shortly.</p>',
                addFieldTextValue: 'Add value',
                closeModalText: 'Close',
                addModalText: 'Add',
                addModalHeader: 'Add value',
                emptyFieldError: 'This field cannot be empty',
                defaultCustomValidationError: 'This field failed custom validation',
                sessionExpiredHtml: '<h2 class="fc-header">Your session has expired</h2><p>Unfortunately, due to a period of extended inactivity, your session has expired. To fill out a new form submission, please refresh your page.</p>',
                creditCardNameText: 'Name (as it appears on your card)',
                creditCardNumberText: 'Card number (no dashes or spaces)',
                creditCardExpiryDateText: 'Expiration date',
                creditCardSecurityCodeText: 'Security code (3 on back, Amex: 4 on front)',
                monthNames: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
                creditCardMissingName: "You must enter a valid name as it appears on your credit card",
                creditCardMissingNumber: "You must enter a valid credit card number",
                creditCardMissingExpiryDate: "You must enter a valid expiry date",
                creditCardExpired: "Your card has expired",
                creditCardMissingSecurityCode: "You must enter a valid security code",
                creditCardNumberIncorrectFormat: "The format of your credit card number is incorrect, please verify your details",
                edit: "Edit",
                delete: "Delete",
                defaultModalTitle: 'Information',
                deleteDialogHeader: "Are you sure?",
                editDialogHeader: "Edit",
                deleteSignatoryDialogText: "Are you sure you want to delete the selected signatory?",
                editSignatoryDialogText: "Edit signatory",
                confirm: "Confirm",
                invalidCardFormat: "The credit card you entered could not be recognised",
                sendEmail: "Send email",
                fieldValidated: "<p>Successfully verified</p>",
                fieldMustBeVerified: "You must first complete verification",
                sendSms: "Send SMS",
                payNow: "Pay now",
                creditCardSuccess: "<p>Your payment has successfully been processed.</p>",
                paymentRequired: "Payment is required before proceeding.",
                paymentGst: "GST:",
                paymentSubTotal: "Sub-total:",
                paymentTotal: "Total:",
                currencySymbol: "$",
                total: "Total",
                description: "Description",
                paymentDescription: "Application completion",
                validate: 'Validate',
                validAbnRequired: 'You must enter and validate a valid ABN.',
                helpModalLink: 'what is this?',
                helpTitle: 'What is this?'
            };

            // Update with client options
            if (typeof data === 'object' && Object.keys(data).length > 0) {
                for (key in data) {
                    if (data.hasOwnProperty(key)) {
                        fc.lang[key] = data[key];
                    }
                }
            }
        },

        /**
         * Fetches and returns a setting value passed down from the remote server.
         *
         * @param settingName
         * @param defaultValue
         * @returns {*}
         */
        getSetting: function (settingName, defaultValue) {
            if (fc.settings && fc.settings[settingName] !== undefined) {
                return fc.settings[settingName];
            }

            return defaultValue;
        },

        /**
         * Initialise the existing session, or instantiate a new one.
         */
        initSession: function () {
            // If session id already exists (@todo: and allowed to set sessions), set it
            if (this.sessionId !== undefined && this.getSetting(this.constants.persistentSessions, false)) {
                $.cookie(this.config.sessionIdName, this.sessionId);
                return;
            }

            // Initialise a new session
            if (this.sessionId === undefined && $.cookie(this.config.sessionIdName) === undefined) {
                this.sessionId = generateRandomString(this.config.sessionKeyLength);
                $.cookie(this.config.sessionIdName, this.sessionId);
            } else {
                this.sessionId = $.cookie(this.config.sessionIdName);
            }
        },

        /**
         * Returns true if a page is valid, false if not
         * @param pageId
         * @returns {boolean}
         */
        pageIsValid: function (pageId) {
            var selector = $('.fc-page[data-page-id="' + pageId + '"]');
            if (selector && selector.length > 0) {
                return validForm(selector, false);
            }
        },

        getPageById: getPageById,

        /**
         * Returns whether two values are equal.
         *
         * @param field
         * @param comparisonValue
         * @returns {boolean}
         */
        comparisonEqual: function (field, comparisonValue) {
            if (field === undefined) {
                return false;
            }

            return field === comparisonValue;
        },

        /**
         * Checks whether a string exists within an array
         * @param field
         * @param comparisonValue
         * @param dataId
         * @returns {boolean}
         */
        comparisonIn: function (field, comparisonValue, dataId) {
            if (field === undefined) {
                return false;
            }

            var x,
                value,
                json,
                el;

            // If the field is hidden, should ALWAYS return false (otherwise returns false positives)
            if (typeof dataId === 'string' && dataId.length > 0) {
                if (!fieldIsVisible(dataId)) {
                    return false;
                }
            }

            // Attempt to typecast string to json
            try {
                json = $.parseJSON(field);
                field = json;
            } catch (ignore) {
            }

            // Field can be string
            if (typeof field === 'string') {
                if (typeof comparisonValue === 'object') {
                    for (x = 0; x < comparisonValue.length; x += 1) {
                        value = comparisonValue[x];
                        if (field === value) {
                            return true;
                        }
                    }
                }
            } else if (field && comparisonValue && typeof field === "object" && typeof comparisonValue === "object") {
                // Check an array of values against an array of values
                for (x = 0; x < comparisonValue.length; x += 1) {
                    try {
                        if (field && field.indexOf(comparisonValue[x]) === -1) {
                            return false;
                        }
                    } catch (ignore) {
                    }
                }

                return true;
            }

            return false;
        },

        /**
         * Make sure a value does not exist within a set
         * @param field
         * @param comparisonValue
         * @param dataId
         * @returns {boolean}
         */
        comparisonNot_in: function (field, comparisonValue, dataId) {
            return !fc.comparisonIn(field, comparisonValue, dataId);
        },

        /**
         * Checks to see if a value against a field has been set
         * @param field
         * @returns {boolean}
         */
        comparisonIs_not_null: function (field) {
            return field !== undefined;
        },

        /**
         * Checks to see if a value against a field has been set
         * @param field
         * @returns {boolean}
         */
        comparisonIs_null: function (field) {
            return field === undefined;
        },

        /**
         * Converts a string to camel case.
         * @param str
         * @returns {*}
         */
        toCamelCase: function (str) {
            return str.replace(/^([A-Z])|\s(\w)/g, function (match, p1, p2) {
                if (p2) {getConfig
                    return p2.toUpperCase();
                }
                return p1.toLowerCase();
            });
        },

        /**
         * Tests if a value is within a particular range.
         * @param params
         * @param value
         * @returns {boolean}
         */
        validatorRange: function (params, value) {
            if (!$.isNumeric(value)) {
                return false;
            }

            var min = parseFloat(params[0]),
                max = parseFloat(params[1]),
                val = parseFloat(value);

            return val >= min && val <= max;
        },

        /**
         * Tests if above a minimum value.
         * @param params
         * @param value
         * @returns {boolean}
         */
        validatorMin: function (params, value) {
            if (!$.isNumeric(value)) {
                return false;
            }

            return parseFloat(value) >= parseFloat(params[0]);
        },

        /**
         * Test if below minimum value.
         * @param params
         * @param value
         * @returns {boolean}
         */
        validatorMax: function (params, value) {
            if (!$.isNumeric(value)) {
                return false;
            }

            return parseFloat(value) <= parseFloat(params[0]);
        },

        /**
         * Test a string against a regular expression.
         * @param params
         * @param value
         * @returns {boolean|*}
         */
        validatorRegularExpression: function (params, value) {
            var re = new RegExp(params[0]);
            return re.test(value);
        }
    };

}(jQuery));