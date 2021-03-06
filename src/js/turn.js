/**
 * @author Emmanuel Garcia
 * @author Jonas Orrico
 * @author Luiz Filipe Machado Barni @odahcam
 */
(function ($, window, document, undefined) {

    "use strict";

    var has3d,
        hasRot,
        vendor = '',
        version = '4.1.4',
        PI = Math.PI,
        A90 = PI / 2,
        isTouch = 'ontouchstart' in window,
        triggers = (isTouch) ? {
            down: 'touchstart',
            move: 'touchmove',
            up: 'touchend',
            over: 'touchstart',
            out: 'touchend'
        } : { // notTouch
                down: 'mousedown',
                move: 'mousemove',
                up: 'mouseup',
                over: 'mouseover',
                out: 'mouseout'
            },
        resizeTimeoutID,

        /*
         * Contansts used for each corner
         *   | tl * tr |
         * l | *     * | r
         *   | bl * br |
         */

        corners = {
            forward: ['br', 'tr'], // 'bottom-right', 'top-right'
            backward: ['bl', 'tl'], // 'bottom-left', 'top-left'
            all: ['tl', 'bl', 'tr', 'br', 'l', 'r'] // 'top-left', 'bottom-left', 'top-right', 'bottom-right', 'left', 'right'
        },

        // Display values
        displays = ['single', 'double'],

        // Direction values
        directions = ['ltr', 'rtl'],

        // Default options
        turnOptions = {

            // The Flipingbook DOM element
            elem: document,

            // The Flipingbook jQuery Object
            $elem: $,

            // Wait time for resizing the Flipingbook after a window resize.
            resizeTimeout: 80,

            // Enables hardware
            acceleration: (navigator.userAgent.indexOf('Chrome') < 0), // Hardware acceleration

            // Display
            display: 'double',

            // Duration of transition in milliseconds
            duration: 600,

            // First page
            page: 1,

            // Enables gradients
            gradients: true,

            // Corners used when turning the page, use only 2 values
            turnCorners: ['bl', 'br'],

            // The pages source folder
            sourceFolder: '',

            // Events
            when: null,

            // Own Size, allows the flipbook to be dimensioned by the pages width
            ownSize: false
        },

        flipOptions = {
            // Size of the active zone of each corner
            cornerSize: 200

        },

        // Number of pages in the DOM, minimum value: 6
        pagesInDOM = 6,

        // Methods and properties for the flip page effect
        turnMethods = {
            // Singleton constructor
            // $('#selector').turn([options]);
            init: function (options) {

                // Define constants
                has3d = 'WebKitCSSMatrix' in window || 'MozPerspective' in document.body.style;
                hasRot = rotationAvailable();
                vendor = getCSSVendorPrefix();

                var i,
                    pageNum = 0,
                    // $elem = this.wrapInner('<div class="turn-container">').children(),
                    // $wrapper = this,
                    // should not add any content to outside of the given element
                    $elem = this,
                    $wrapper = $elem.wrapInner('<div class="turn-container">').parent(),
                    $children = $elem.children(),
                    data = $elem.data();

                // Set initial configuration
                options = $.extend({
                    width: $elem.width(),
                    height: $elem.height()
                }, turnOptions, {
                        direction: $elem.css('direction') // CSS direction
                    }, options, {
                        $elem: $elem,
                        elem: $elem[0]
                    });

                $.extend(data, {
                    options: options,
                    pageObjs: {},
                    pages: {},
                    pageWrap: {},
                    pageZoom: {},
                    pagePlace: {},
                    pageMv: [],
                    zoom: 1,
                    totalPages: options.pages || 0,
                    eventHandlers: {
                        touchStart: $.proxy(turnMethods._touchStart, $elem),
                        touchMove: $.proxy(turnMethods._touchMove, $elem),
                        touchEnd: $.proxy(turnMethods._touchEnd, $elem),
                        start: $.proxy(turnMethods._eventStart, $elem)
                    }
                });

                // Add event listeners
                if (options.when) {
                    for (i in options.when) {
                        if (has(i, options.when)) {
                            $elem.on(i, options.when[i]);
                        }
                    }
                }

                this // Set the css
                    .css({
                        width: options.width,
                        height: options.height
                    })
                    // Set the initial display
                    .turn('display', options.display)
                    // Set the direction
                    .turn('direction', options.direction);

                /*
                Prevent blue screen problems of switching to hardware
                acceleration mode by forcing hardware acceleration for ever
                */
                if (has3d && !isTouch && options.acceleration)
                    $elem.transform(cssTranslateString(0, 0, true));

                // Add pages from the DOM
                for (i = 0; i < $children.length; i++) {
                    if ($children.eq(i).attr('ignore') != '1') {
                        $elem.turn('addPage', ++pageNum, $children[i]);
                    }
                }

                // Event listeners
                this.on(triggers.down, data.eventHandlers.touchStart)
                    .on('end', turnMethods._eventEnd)
                    .on('pressed', turnMethods._eventPressed)
                    .on('released', turnMethods._eventReleased)
                    .on('flip', turnMethods._flip);

                $wrapper.on('start', data.eventHandlers.start);

                $(document)
                    .on(triggers.move, data.eventHandlers.touchMove)
                    .on(triggers.up, data.eventHandlers.touchEnd);

                $(window)
                    .on('resize', turnMethods.resizeViewport.bind($elem));

                turnMethods.resizeViewport.call($elem);

                // Set the initial page
                $elem.turn('page', options.page);

                // This flipbook is ready
                data.done = true;

                return this;
            },

            // Adds a page from external data

            addPage: function (page, elem) {

                var currentPage,
                    parity,
                    incPages = false,
                    data = this.data(),
                    lastPage = data.totalPages + 1,
                    $elem = $(elem || '<div>');

                if (data.destroying)
                    return false;

                if (page) {
                    if (page == lastPage)
                        incPages = true;
                    else if (page > lastPage)
                        throw new Error('Page "' + page + '" could not be inserted.');

                } else {

                    page = lastPage;
                    incPages = true;

                }

                if (page > 0 && page <= lastPage) {

                    if (data.display == 'double') {
                        parity = (page % 2) ? ' odd' : ' even';
                    } else {
                        parity = '';
                    }

                    // Stop animations
                    if (data.done)
                        this.turn('stop');

                    // Move pages if it's necessary
                    if (page in data.pageObjs)
                        turnMethods._movePages.call(this, page, 1);

                    // Increase the number of pages
                    if (incPages)
                        data.totalPages = lastPage;

                    // Add elem
                    // Add the initial HTML
                    // It will contain a loader indicator and a gradient
                    data.pageObjs[page] = $elem.addClass('page page-' + page + parity).data('page', page).html('<div class="gradient"/><div class="loader"/>');

                    // Checks if there's hard page compatibility
                    // IE9 is the only browser that does not support hard pages
                    if (navigator.userAgent.indexOf('MSIE 9.0') !== -1 && data.pageObjs[page].hasClass('hard')) {
                        data.pageObjs[page].removeClass('hard');
                    }

                    // Add page
                    turnMethods._addPage.call(this, page);

                    // Remove pages out of range
                    turnMethods._removeFromDOM.call(this);

                    turnMethods.loadPage.call(this, page, data.pageObjs[page]);
                }

                return this;
            },

            // Adds a page
            _addPage: function (page) {

                var data = this.data(),
                    $elem = data.pageObjs[page] || false;

                console.groupCollapsed('_addPage');

                if ($elem) {
                    if (turnMethods._necessPage.call(this, page)) {

                        if (!data.pageWrap[page]) {

                            var parity = '';

                            if (data.display == 'double')
                                parity = (page % 2) ? ' odd' : ' even';

                            // Wrapper
                            data.pageWrap[page] = $('<div>').addClass('page-wrapper' + parity).data('page', page);

                            // Append to this flipbook
                            this.append(data.pageWrap[page]);

                            if (!data.pagePlace[page]) {

                                data.pagePlace[page] = page;
                                // Move `pageObjs[page]` to wrapper
                                $elem.appendTo(data.pageWrap[page]);

                            }

                            // Set the size of the page
                            var prop = turnMethods._pageSize.call(this, page, true);
                            $elem.css({
                                width: prop.width,
                                height: prop.height
                            });
                            data.pageWrap[page].css(prop);

                        }

                        if (data.pagePlace[page] == page) {

                            // If the page isn't in another place, create the flip effect
                            turnMethods._makeFlip.call(this, page);

                        }

                    } else {

                        // Place
                        data.pagePlace[page] = 0;

                        // Remove $elem from the DOM
                        if ($elem)
                            $elem.remove();

                    }

                }

                console.groupEnd();

            },

            loadPage: function (page, $page) {

                console.log(this.data().options);

                // Create an image element
                $('<img>')
                    // preventClick
                    .on('mousedown', function (e) {
                        e.preventDefault();
                    })
                    // waits for load
                    .on('load', function () {
                        $page
                            // Add the image to the page after loaded
                            .append(this)
                            // Remove the loader indicator
                            .find('.loader').remove();
                    })
                // starts to load
                [0].src = this.data().options.sourceFolder + (page + 1000) + '.jpg';

            },

            // Checks if a page is in memory

            hasPage: function (page) {
                return has(page, this.data().pageObjs);
            },

            // Centers the flipbook

            center: function (page) {

                var data = this.data(),
                    size = this.turn('size'),
                    left = 0;

                if (!data.noCenter) {
                    if (data.display == 'double') {
                        var view = this.turn('view', page || data.tpage || data.page);

                        if (data.direction == 'ltr') {
                            if (!view[0])
                                left -= size.width / 4;
                            else if (!view[1])
                                left += size.width / 4;
                        } else {
                            if (!view[0])
                                left += size.width / 4;
                            else if (!view[1])
                                left -= size.width / 4;
                        }

                    }

                    this.css({
                        marginLeft: left
                    });
                }

                return this;

            },

            // Destroys the flipbook

            destroy: function () {

                var page,
                    flipbook = this,
                    data = this.data(),
                    events = [
                        'end', 'first', 'flip', 'last', 'pressed',
                        'released', 'start', 'turning', 'turned',
                        'zooming', 'missing'
                    ];

                if (trigger('destroying', this) == 'prevented')
                    return;

                data.destroying = true;

                $.each(events, function (index, eventName) {
                    flipbook.off(eventName);
                });

                $wrapper.off('start', data.eventHandlers.start);

                $(document)
                    .off(triggers.move, data.eventHandlers.touchMove)
                    .off(triggers.up, data.eventHandlers.touchEnd);

                while (data.totalPages !== 0) {
                    this.turn('removePage', data.totalPages);
                }

                if (data.fparent)
                    data.fparent.remove();

                if (data.shadow)
                    data.shadow.remove();

                this.removeData();
                data = null;

                return this;

            },

            // Checks if this element is a flipbook
            is: function () {

                return typeof this.data().pages == 'object';

            },

            // Sets and gets the zoom value

            zoom: function (newZoom) {

                var data = this.data();

                if (typeof (newZoom) == 'number') {

                    if (newZoom < 0.001 || newZoom > 100)
                        throw new Error('"' + newZoom + '" is not a value for zoom.');

                    if (trigger('zooming', this, [newZoom, data.zoom]) == 'prevented')
                        return this;

                    var size = this.turn('size'),
                        currentView = this.turn('view'),
                        iz = 1 / data.zoom,
                        newWidth = Math.round(size.width * iz * newZoom),
                        newHeight = Math.round(size.height * iz * newZoom);

                    data.zoom = newZoom;

                    this.turn('stop')
                        .turn('size', newWidth, newHeight);
                    /* .css({marginTop: size.height * iz / 2 - newHeight / 2}); */

                    if (data.options.autoCenter)
                        this.turn('center');
                    /* else
                    $(this).css({marginLeft: size.width * iz / 2 - newWidth / 2}); */

                    turnMethods._updateShadow.call(this);

                    for (var i = 0; i < currentView.length; i++) {
                        if (currentView[i] && data.pageZoom[currentView[i]] != data.zoom) {

                            this.trigger('zoomed', [
                                currentView[i],
                                currentView,
                                data.pageZoom[currentView[i]],
                                data.zoom
                            ]);

                            data.pageZoom[currentView[i]] = data.zoom;
                        }
                    }
                    return this;
                } else
                    return data.zoom;
            },

            // Gets the size of a page

            _pageSize: function (page, position) {

                var data = this.data(),
                    prop = {};

                console.groupCollapsed('_pageSize');

                if (data.display == 'single') {

                    prop.width = this.width();
                    prop.height = this.height();

                    if (position) {
                        prop.top = 0;
                        prop.left = 0;
                        prop.right = 'auto';
                    }

                } else {

                    var pageWidth = this.width() / 2,
                        pageHeight = this.height();

                    console.log(data);

                    if (data.options.ownSize ||
                        data.pageObjs[page].hasClass('own-size')) {
                        prop.width = data.pageObjs[page].width();
                        prop.height = data.pageObjs[page].height();
                    } else {
                        prop.width = pageWidth;
                        prop.height = pageHeight;
                    }

                    if (position) {
                        var isOdd = page % 2;
                        prop.top = (pageHeight - prop.height) / 2;

                        if (data.direction == 'ltr') {

                            prop[isOdd ? 'right' : 'left'] = pageWidth - prop.width;
                            prop[isOdd ? 'left' : 'right'] = 'auto';

                        } else {

                            prop[isOdd ? 'left' : 'right'] = pageWidth - prop.width;
                            prop[isOdd ? 'right' : 'left'] = 'auto';

                        }

                    }
                }

                console.groupEnd();

                return prop;

            },

            // Prepares the flip effect for a page

            _makeFlip: function (page) {

                var data = this.data();

                console.group('_makeFlip');

                if (!data.pages[page] && data.pagePlace[page] == page) {

                    var isSingle = data.display == 'single',
                        isOdd = page % 2;

                    console.info(data.pagePlace[page]);

                    console.info(page);

                    data.pages[page] = data.pageObjs[page]
                        .css(turnMethods._pageSize.call(this, page))
                        .flip({
                            page: page,
                            next: isOdd || isSingle ? page + 1 : page - 1,
                            turn: this
                        })
                        .flip('disable', data.disabled);

                    // Issue about z-index
                    turnMethods._setPageLoc.call(this, page);

                    data.pageZoom[page] = data.zoom;

                }

                console.groupEnd();

                return data.pages[page];
            },

            // Makes pages within a range

            _makeRange: function () {

                var page,
                    range,
                    data = this.data();

                if (data.totalPages < 1)
                    return;

                range = this.turn('range');

                for (page = range[0]; page <= range[1]; page++)
                    turnMethods._addPage.call(this, page);

            },

            // Returns a range of pages that should be in the DOM
            // Example:
            // - page in the current view, return true
            // * page is in the range, return true
            // Otherwise, return false
            //
            // 1 2-3 4-5 6-7 8-9 10-11 12-13
            //   **  **  --   **  **

            range: function (page) {

                var remainingPages, left, right, view,
                    data = this.data();

                page = page || data.tpage || data.page || 1;
                view = turnMethods._view.call(this, page);

                if (page < 1 || page > data.totalPages)
                    throw new Error('The page "' + page + '" is not valid.');


                view[1] = view[1] || view[0];

                if (view[0] >= 1 && view[1] <= data.totalPages) {

                    remainingPages = Math.floor((pagesInDOM - 2) / 2);

                    if (data.totalPages - view[1] > view[0]) {
                        left = Math.min(view[0] - 1, remainingPages);
                        right = 2 * remainingPages - left;
                    } else {
                        right = Math.min(data.totalPages - view[1], remainingPages);
                        left = 2 * remainingPages - right;
                    }

                } else {
                    left = pagesInDOM - 1;
                    right = pagesInDOM - 1;
                }

                return [Math.max(1, view[0] - left),
                Math.min(data.totalPages, view[1] + right)
                ];

            },

            // Detects if a page is within the range of `pagesInDOM` from the current view

            _necessPage: function (page) {

                if (page === 0)
                    return true;

                var range = this.turn('range');

                return this.data()
                    .pageObjs[page].hasClass('fixed') || (page >= range[0] && page <= range[1]);

            },

            // Releases memory by removing pages from the DOM

            _removeFromDOM: function () {

                var page, data = this.data();

                for (page in data.pageWrap) {
                    if (has(page, data.pageWrap) && !turnMethods._necessPage.call(this, page)) {
                        turnMethods._removePageFromDOM.call(this, page);
                    }
                }
            },

            // Removes a page from DOM and its internal references

            _removePageFromDOM: function (page) {

                var data = this.data();

                if (data.pages[page]) {
                    var dd = data.pages[page].data();

                    flipMethods._moveFoldingPage.call(data.pages[page], false);

                    if (dd.f && dd.f.fwrapper)
                        dd.f.fwrapper.remove();

                    data.pages[page].removeData();
                    data.pages[page].remove();
                    delete data.pages[page];
                }

                if (data.pageObjs[page])
                    data.pageObjs[page].remove();

                if (data.pageWrap[page]) {
                    data.pageWrap[page].remove();
                    delete data.pageWrap[page];
                }

                turnMethods._removeMv.call(this, page);

                delete data.pagePlace[page];
                delete data.pageZoom[page];

            },

            // Removes a page

            removePage: function (page) {

                var data = this.data();

                // Delete all the pages
                if (page == '*') {

                    while (data.totalPages > 0) {
                        this.turn('removePage', data.totalPages);
                    }

                } else {

                    if (page < 1 || page > data.totalPages)
                        throw new Error('The page "' + page + '" doesn\'t exist.');

                    if (data.pageObjs[page]) {

                        // Stop animations
                        this.turn('stop');

                        // Remove `page`
                        turnMethods._removePageFromDOM.call(this, page);

                        delete data.pageObjs[page];

                    }

                    // Move the pages
                    turnMethods._movePages.call(this, page, -1);

                    // Resize the size of this flipbook
                    data.totalPages = data.totalPages - 1;

                    // Check the current view
                    if (data.page > data.totalPages) {

                        data.page = null;
                        turnMethods._fitPage.call(this, data.totalPages);

                    } else {

                        turnMethods._makeRange.call(this);
                        this.turn('update');

                    }
                }

                return this;

            },

            // Moves pages

            _movePages: function (from, change) {

                var page,
                    that = this,
                    data = this.data(),
                    single = data.display == 'single',
                    move = function (page) {

                        var next = page + change,
                            odd = next % 2,
                            parity = (odd) ? ' odd' : ' even';

                        if (data.pageObjs[page])

                            data.pageObjs[next] = data.pageObjs[page].removeClass('page-' + page + ' odd even').addClass('page-' + next + parity);

                        if (data.pagePlace[page] && data.pageWrap[page]) {

                            data.pagePlace[next] = next;

                            if (data.pageObjs[next].hasClass('fixed'))
                                data.pageWrap[next] = data.pageWrap[page].data('page', next);
                            else
                                data.pageWrap[next] = data.pageWrap[page].css(turnMethods._pageSize.call(that, next, true)).data('page', next);

                            if (data.pages[page])
                                data.pages[next] = data.pages[page].flip('options', {
                                    page: next,
                                    next: (single || odd) ? next + 1 : next - 1
                                });

                            if (change) {
                                delete data.pages[page];
                                delete data.pagePlace[page];
                                delete data.pageZoom[page];
                                delete data.pageObjs[page];
                                delete data.pageWrap[page];
                            }

                        }

                    };

                if (change > 0)
                    for (page = data.totalPages; page >= from; page--)
                        move(page);
                else
                    for (page = from; page <= data.totalPages; page++)
                        move(page);

            },

            // Sets or Gets the display mode
            display: function (display) {

                var data = this.data(),
                    currentDisplay = data.display;

                if (display === undefined) {

                    return currentDisplay;

                } else {

                    if ($.inArray(display, displays) == -1)
                        throw new Error('"' + display + '" is not a value for display.');

                    switch (display) {
                        case 'single':

                            // Create a temporal page to use as folded page

                            if (!data.pageObjs[0]) {
                                this.turn('stop').css('overflow', 'hidden');

                                data.pageObjs[0] = $('<div>')
                                    .addClass('page p-temporal')
                                    .css({
                                        width: this.width(),
                                        height: this.height()
                                    })
                                    .appendTo(this);
                            }

                            this.addClass('shadow');

                            break;
                        case 'double':

                            // Remove the temporal page

                            if (data.pageObjs[0]) {
                                this.turn('stop')
                                    .css('overflow', '');
                                data.pageObjs[0].remove();
                                delete data.pageObjs[0];
                            }

                            this.removeClass('shadow');

                            break;
                    }


                    data.display = display;

                    if (currentDisplay) {
                        var size = this.turn('size');
                        turnMethods._movePages.call(this, 1, 0);
                        this.turn('size', size.width, size.height)
                            .turn('update');
                    }

                    return this;

                }

            },

            // Gets and sets the direction of the flipbook

            direction: function (dir) {

                var data = this.data();

                if (dir === undefined) {

                    return data.direction;

                } else {

                    dir = dir.toLowerCase();

                    if ($.inArray(dir, directions) == -1)
                        throw new Error('"' + dir + '" is not a valid direction.');

                    if (dir == 'rtl') {
                        this.attr('dir', 'ltr')
                            .css('direction', 'ltr');
                    }

                    data.direction = dir;

                    if (data.done)
                        this.turn('size', $(this)
                            .width(), $(this)
                                .height());

                    return this;
                }

            },

            // Detects animation

            animating: function () {

                return this.data()
                    .pageMv.length > 0;

            },

            // Gets the current activated corner

            corner: function () {

                var corner,
                    page,
                    data = this.data();

                for (page in data.pages) {
                    if (has(page, data.pages))
                        if ((corner = data.pages[page].flip('corner'))) {
                            return corner;
                        }
                }

                return false;
            },

            // Gets the data stored in the flipbook

            data: function () {

                return this.data();

            },

            // Disables and enables the effect

            disable: function (disable) {

                var page,
                    data = this.data(),
                    view = this.turn('view');

                data.disabled = disable === undefined || disable === true;

                for (page in data.pages) {
                    if (has(page, data.pages))
                        data.pages[page].flip('disable',
                            (data.disabled) ? true : $.inArray(parseInt(page, 10), view) == -1);
                }

                return this;

            },

            // Disables and enables the effect

            disabled: function (disable) {

                if (disable === undefined) {
                    return this.data()
                        .disabled === true;
                } else {
                    return this.turn('disable', disable);
                }

            },

            // Gets and sets the size

            size: function (width, height) {

                if (width === undefined || height === undefined) {

                    return {
                        width: this.width(),
                        height: this.height()
                    };

                } else {

                    this.turn('stop');

                    var page, prop,
                        data = this.data(),
                        pageWidth = (data.display == 'double') ? width / 2 : width;

                    this.css({
                        width: width,
                        height: height
                    });

                    if (data.pageObjs[0])
                        data.pageObjs[0].css({
                            width: pageWidth,
                            height: height
                        });

                    for (page in data.pageWrap) {
                        if (!has(page, data.pageWrap)) continue;

                        prop = turnMethods._pageSize.call(this, page, true);

                        data.pageObjs[page].css({
                            width: prop.width,
                            height: prop.height
                        });
                        data.pageWrap[page].css(prop);

                        if (data.pages[page])
                            data.pages[page].css({
                                width: prop.width,
                                height: prop.height
                            });
                    }

                    this.turn('resize');

                    return this;

                }
            },

            // Resizes each page

            resize: function () {

                var page, data = this.data();

                if (data.pages[0]) {
                    data.pageWrap[0].css('left', -this.width());
                    data.pages[0].flip('resize', true);
                }

                for (page = 1; page <= data.totalPages; page++)
                    if (data.pages[page])
                        data.pages[page].flip('resize', true);

                turnMethods._updateShadow.call(this);

                if (data.options.autoCenter)
                    this.turn('center');

            },

            // Removes an animation from the cache

            _removeMv: function (page) {

                var i, data = this.data();

                for (i = 0; i < data.pageMv.length; i++)
                    if (data.pageMv[i] == page) {
                        data.pageMv.splice(i, 1);
                        return true;
                    }

                return false;

            },

            // Adds an animation to the cache

            _addMv: function (page) {

                var data = this.data();

                turnMethods._removeMv.call(this, page);
                data.pageMv.push(page);

            },

            // Gets indexes for a view

            _view: function (page) {

                var data = this.data();

                page = page || data.page;

                if (data.display == 'double')
                    return (page % 2) ? [page - 1, page] : [page, page + 1];
                else
                    return [page];

            },

            // Gets a view

            view: function (page) {

                var data = this.data(),
                    view = turnMethods._view.call(this, page);

                if (data.display == 'double')
                    return [(view[0] > 0) ? view[0] : 0,
                    (view[1] <= data.totalPages) ? view[1] : 0
                    ];
                else
                    return [(view[0] > 0 && view[0] <= data.totalPages) ? view[0] : 0];

            },

            // Stops animations

            stop: function (ignore, animate) {

                if (this.turn('animating')) {

                    var i, options, page,
                        data = this.data();

                    if (data.tpage) {
                        data.page = data.tpage;
                        delete data.tpage;
                    }

                    for (i = 0; i < data.pageMv.length; i++) {

                        if (!data.pageMv[i] || data.pageMv[i] === ignore)
                            continue;

                        page = data.pages[data.pageMv[i]];
                        options = page.data().f.options;

                        page.flip('hideFoldedPage', animate);

                        if (!animate)
                            flipMethods._moveFoldingPage.call(page, false);

                        if (options.force) {
                            options.next = (options.page % 2 === 0) ? options.page - 1 : options.page + 1;
                            delete options.force;
                        }

                    }
                }

                this.turn('update');

                return this;
            },

            // Gets and sets the number of pages

            pages: function (pages) {

                var data = this.data();

                if (pages) {

                    if (pages < data.totalPages) {

                        for (var page = data.totalPages; page > pages; page--)
                            this.turn('removePage', page);

                    }

                    data.totalPages = pages;
                    turnMethods._fitPage.call(this, data.page);

                    return this;

                } else
                    return data.totalPages;

            },

            // Checks missing pages

            _missing: function (page) {

                var data = this.data();

                if (data.totalPages < 1)
                    return;

                var p,
                    range = this.turn('range', page),
                    missing = [];

                for (p = range[0]; p <= range[1]; p++) {
                    if (!data.pageObjs[p])
                        missing.push(p);
                }

                if (missing.length > 0)
                    this.trigger('missing', [missing]);

            },

            // Sets a page without effect

            _fitPage: function (page) {

                var data = this.data(),
                    newView = this.turn('view', page);

                turnMethods._missing.call(this, page);

                if (!data.pageObjs[page])
                    return;

                data.page = page;

                this.turn('stop');

                for (var i = 0; i < newView.length; i++) {

                    if (newView[i] && data.pageZoom[newView[i]] != data.zoom) {

                        this.trigger('zoomed', [
                            newView[i],
                            newView,
                            data.pageZoom[newView[i]],
                            data.zoom
                        ]);

                        data.pageZoom[newView[i]] = data.zoom;

                    }
                }

                turnMethods._removeFromDOM.call(this);
                turnMethods._makeRange.call(this);
                turnMethods._updateShadow.call(this);
                this.trigger('turned', [page, newView]);
                this.turn('update');

                if (data.options.autoCenter)
                    this.turn('center');

            },

            // Turns the page

            _turnPage: function (page) {

                var current,
                    next,
                    data = this.data(),
                    place = data.pagePlace[page],
                    view = this.turn('view'),
                    newView = this.turn('view', page);


                if (data.page != page) {

                    var currentPage = data.page;

                    if (trigger('turning', this, [page, newView]) == 'prevented') {

                        if (currentPage == data.page && $.inArray(place, data.pageMv) != -1)
                            data.pages[place].flip('hideFoldedPage', true);

                        return;

                    }

                    if ($.inArray(1, newView) != -1)
                        this.trigger('first');
                    if ($.inArray(data.totalPages, newView) != -1)
                        this.trigger('last');

                }

                if (data.display == 'single') {
                    current = view[0];
                    next = newView[0];
                } else if (view[1] && page > view[1]) {
                    current = view[1];
                    next = newView[0];
                } else if (view[0] && page < view[0]) {
                    current = view[0];
                    next = newView[1];
                }

                var optionsCorners = data.options.turnCorners,
                    flipData = data.pages[current].data().f,
                    options = flipData.options,
                    actualPoint = flipData.point;

                turnMethods._missing.call(this, page);

                if (!data.pageObjs[page])
                    return;

                this.turn('stop');

                data.page = page;

                turnMethods._makeRange.call(this);

                data.tpage = next;

                if (options.next != next) {
                    options.next = next;
                    options.force = true;
                }

                this.turn('update');

                flipData.point = actualPoint;

                if (flipData.effect == 'hard')
                    if (data.direction == 'ltr')
                        data.pages[current].flip('turnPage',
                            (page > current) ? 'r' : 'l');
                    else
                        data.pages[current].flip('turnPage',
                            (page > current) ? 'l' : 'r');
                else {
                    if (data.direction == 'ltr')
                        data.pages[current].flip('turnPage',
                            optionsCorners[(page > current) ? 1 : 0]);
                    else
                        data.pages[current].flip('turnPage',
                            optionsCorners[(page > current) ? 0 : 1]);
                }

            },

            // Gets and sets a page

            page: function (page) {

                var data = this.data();

                if (page === undefined) {

                    return data.page;

                } else {

                    if (!data.disabled && !data.destroying) {

                        page = parseInt(page, 10);

                        if (page > 0 && page <= data.totalPages) {

                            if (page != data.page) {
                                if (!data.done || $.inArray(page, this.turn('view')) != -1)
                                    turnMethods._fitPage.call(this, page);
                                else
                                    turnMethods._turnPage.call(this, page);
                            }

                            return this;

                        } else {

                            throw new Error('The page "' + page + '" does not exist.');

                        }

                    }

                }

            },

            /**
             * Turns to the next view
             **/
            next: function () {

                return this.turn('page', Math.min(this.data()
                    .totalPages,
                    turnMethods._view.call(this, this.data()
                        .page)
                        .pop() + 1));

            },

            /**
             * Turns to the previous view
             **/
            previous: function () {

                return this.turn('page', Math.max(1,
                    turnMethods._view.call(this, this.data()
                        .page)
                        .shift() - 1));

            },

            /**
             * Shows a peeling corner
             **/
            peel: function (corner, animate) {

                var data = this.data(),
                    view = this.turn('view');

                animate = (animate === undefined) ? true : animate === true;

                if (corner === false) {

                    this.turn('stop', null, animate);

                } else {

                    if (data.display == 'single') {

                        data.pages[data.page].flip('peel', corner, animate);

                    } else {

                        var page;

                        if (data.direction == 'ltr') {

                            page = (corner.indexOf('l') != -1) ? view[0] : view[1];

                        } else {

                            page = (corner.indexOf('l') != -1) ? view[1] : view[0];

                        }

                        if (data.pages[page]) {
                            data.pages[page].flip('peel', corner, animate);
                        }
                    }
                }

                return this;

            },

            /**
             * Adds a motion to the internal list.
             * This event is called in context of flip.
             **/
            _addMotionPage: function () {
                var options = $(this).data().f.options;

                turnMethods._addMv.call(options.turn, options.page);
            },

            /**
             * This event is called in context of flip.
             **/
            _eventStart: function (e, options, corner) {
                var data = options.turn.data(),
                    actualZoom = data.pageZoom[options.page];

                if (e.isDefaultPrevented()) {
                    turnMethods._updateShadow.call(options.turn);
                    return;
                }

                if (actualZoom && actualZoom != data.zoom) {

                    options.turn.trigger('zoomed', [
                        options.page,
                        options.turn.turn('view', options.page),
                        actualZoom,
                        data.zoom
                    ]);

                    data.pageZoom[options.page] = data.zoom;

                }

                if (data.display == 'single' && corner) {

                    if ((corner.charAt(1) == 'l' && data.direction == 'ltr') ||
                        (corner.charAt(1) == 'r' && data.direction == 'rtl')) {

                        options.next = (options.next < options.page) ? options.next : options.page - 1;
                        options.force = true;

                    } else {

                        options.next = (options.next > options.page) ? options.next : options.page + 1;

                    }

                }

                turnMethods._addMotionPage.call(e.target);
                turnMethods._updateShadow.call(options.turn);
            },

            /**
             * This event is called in context of flip
             **/
            _eventEnd: function (e, options, turned) {

                var that = $(e.target),
                    data = that.data().f,
                    turn = options.turn,
                    dd = turn.data();

                if (turned) {

                    var tpage = dd.tpage || dd.page;

                    if (tpage == options.next || tpage == options.page) {
                        delete dd.tpage;

                        turnMethods._fitPage.call(turn, tpage || options.next, true);
                    }

                } else {

                    turnMethods._removeMv.call(turn, options.page);
                    turnMethods._updateShadow.call(turn);
                    turn.turn('update');

                }

            },

            /**
             * This event is called in context of flip
             **/
            _eventPressed: function (e) {

                var page,
                    data = $(e.target).data().f,
                    turn = data.options.turn,
                    turnData = turn.data(),
                    pages = turnData.pages;

                turnData.mouseAction = true;

                turn.turn('update');

                data.time = +new Date();

                return data.time;

            },

            /**
             * This event is called in context of flip
             **/
            _eventReleased: function (e, point) {

                var outArea,
                    page = $(e.target),
                    data = page.data().f,
                    turn = data.options.turn,
                    turnData = turn.data();

                if (turnData.display == 'single') {
                    outArea = (point.corner == 'br' || point.corner == 'tr') ?
                        point.x < page.width() / 2 :
                        point.x > page.width() / 2;
                } else {
                    outArea = point.x < 0 || point.x > page.width();
                }

                if (new Date() - data.time < 200 || outArea) {

                    e.preventDefault();
                    turnMethods._turnPage.call(turn, data.options.next);

                }

                turnData.mouseAction = false;

            },

            /**
             * This event is called in context of flip
             **/
            _flip: function (e) {

                e.stopPropagation();

                var options = $(e.target).data().f.options;

                options.turn.trigger('turn', [options.next]);

                if (options.turn.data().options.autoCenter) {
                    options.turn.turn('center', options.next);
                }

            },

            //
            _touchStart: function () {
                var data = this.data();
                for (var page in data.pages) {
                    if (has(page, data.pages) &&
                        flipMethods._eventStart.apply(data.pages[page], arguments) === false) {
                        return false;
                    }
                }
            },

            //
            _touchMove: function () {
                var data = this.data();
                for (var page in data.pages) {
                    if (has(page, data.pages)) {
                        flipMethods._eventMove.apply(data.pages[page], arguments);
                    }
                }
            },

            //
            _touchEnd: function () {
                var data = this.data();
                for (var page in data.pages) {
                    if (has(page, data.pages)) {
                        flipMethods._eventEnd.apply(data.pages[page], arguments);
                    }
                }
            },

            /**
             * Calculate the z-index value for pages during the animation
             **/
            calculateZ: function (mv) {

                var i,
                    page,
                    nextPage,
                    placePage,
                    dpage,
                    that = this,
                    data = this.data(),
                    view = this.turn('view'),
                    currentPage = view[0] || view[1],
                    total = mv.length - 1,
                    r = {
                        pageZ: {},
                        partZ: {},
                        pageV: {}
                    };

                function addView(page) {
                    var view = that.turn('view', page);
                    if (view[0])
                        r.pageV[view[0]] = true;
                    if (view[1])
                        r.pageV[view[1]] = true;
                }

                for (i = 0; i <= total; i++) {
                    page = mv[i];
                    nextPage = data.pages[page].data().f.options.next;
                    placePage = data.pagePlace[page];

                    addView(page);
                    addView(nextPage);

                    dpage = (data.pagePlace[nextPage] == nextPage) ? nextPage : page;

                    r.pageZ[dpage] = data.totalPages - Math.abs(currentPage - dpage);
                    r.partZ[placePage] = data.totalPages * 2 - total + i;
                }

                return r;
            },

            /**
             * Updates the z-index and display property of every page
             **/
            update: function () {

                var page,
                    data = this.data();

                if (this.turn('animating') && data.pageMv[0] !== 0) {

                    // Update motion

                    var p, apage, fixed,
                        pos = this.turn('calculateZ', data.pageMv),
                        corner = this.turn('corner'),
                        actualView = this.turn('view'),
                        newView = this.turn('view', data.tpage);

                    for (page in data.pageWrap) {

                        if (!has(page, data.pageWrap))
                            continue;

                        fixed = data.pageObjs[page].hasClass('fixed');

                        data.pageWrap[page].css({
                            display: (pos.pageV[page] || fixed) ? '' : 'none',
                            zIndex:
                            (data.pageObjs[page].hasClass('hard') ?
                                pos.partZ[page] :
                                pos.pageZ[page]
                            ) || (fixed ? -1 : 0)
                        });

                        if ((p = data.pages[page])) {

                            p.flip('z', pos.partZ[page] || null);

                            if (pos.pageV[page])
                                p.flip('resize');

                            if (data.tpage) { // Is it turning the page to `tpage`?

                                p.flip('hover', false)
                                    .flip('disable',
                                    $.inArray(parseInt(page, 10), data.pageMv) == -1 &&
                                    page != newView[0] &&
                                    page != newView[1]);

                            } else {

                                p.flip('hover', corner === false)
                                    .flip('disable', page != actualView[0] && page != actualView[1]);

                            }

                        }

                    }

                } else {

                    // Update static pages

                    for (page in data.pageWrap) {

                        if (!has(page, data.pageWrap))
                            continue;

                        var pageLocation = turnMethods._setPageLoc.call(this, page);

                        if (data.pages[page]) {
                            data.pages[page].flip('disable', data.disabled || pageLocation != 1)
                                .flip('hover', true)
                                .flip('z', null);
                        }
                    }
                }

                return this;
            },

            /**
             * Updates the position and size of the flipbook's shadow
             **/
            _updateShadow: function () {

                var view, view2, shadow,
                    data = this.data(),
                    width = this.width(),
                    height = this.height(),
                    pageWidth = (data.display == 'single') ? width : width / 2;

                view = this.turn('view');

                if (!data.shadow) {
                    data.shadow = $('<div>')
                        .css(divStyle(0, 0, 0).css)
                        .addClass('shadow')
                        .appendTo(this);
                }

                for (var i = 0; i < data.pageMv.length; i++) {
                    if (!view[0] || !view[1])
                        break;

                    view = this.turn('view', data.pages[data.pageMv[i]].data().f.options.next);
                    view2 = this.turn('view', data.pageMv[i]);

                    view[0] = view[0] && view2[0];
                    view[1] = view[1] && view2[1];
                }

                if (!view[0])
                    shadow = (data.direction == 'ltr') ? 1 : 2;
                else if (!view[1])
                    shadow = (data.direction == 'ltr') ? 2 : 1;
                else
                    shadow = 3;

                switch (shadow) {
                    case 1:
                        data.shadow.css({
                            width: pageWidth,
                            height: height,
                            top: 0,
                            left: pageWidth
                        });
                        break;
                    case 2:
                        data.shadow.css({
                            width: pageWidth,
                            height: height,
                            top: 0,
                            left: 0
                        });
                        break;
                    case 3:
                        data.shadow.css({
                            width: width,
                            height: height,
                            top: 0,
                            left: 0
                        });
                        break;
                }

            },

            /**
             * Sets the z-index and display property of a page it depends on the current view.
             **/
            _setPageLoc: function (page) {

                var data = this.data(),
                    view = this.turn('view'),
                    loc = 0;


                if (page == view[0] || page == view[1])
                    loc = 1;
                else if (
                    (data.display == 'single' && page == view[0] + 1) ||
                    (data.display == 'double' && page == view[0] - 2 || page == view[1] + 2)
                )
                    loc = 2;

                if (!this.turn('animating'))
                    switch (loc) {
                        case 1:
                            data.pageWrap[page].css({
                                zIndex: data.totalPages,
                                display: ''
                            });
                            break;
                        case 2:
                            data.pageWrap[page].css({
                                zIndex: data.totalPages - 1,
                                display: ''
                            });
                            break;
                        case 0:
                            data.pageWrap[page].css({
                                zIndex: 0,
                                display: (data.pageObjs[page].hasClass('fixed')) ? '' : 'none'
                            });
                            break;
                    }

                return loc;
            },

            /**
             * Gets and sets the options
             **/
            options: function (options) {

                var data = this.data();

                if (options === undefined) {

                    return data.options;

                } else {

                    // Set new values
                    $.extend(data.options, options);

                    // Set pages
                    if (options.pages)
                        this.turn('pages', options.pages);

                    // Set page
                    if (options.page)
                        this.turn('page', options.page);

                    // Set display
                    if (options.display)
                        this.turn('display', options.display);

                    // Set direction
                    if (options.direction)
                        this.turn('direction', options.direction);

                    // Set size
                    if (options.width && options.height)
                        this.turn('size', options.width, options.height);

                    // Add event listeners
                    if (options.when)
                        for (var eventName in options.when)
                            if (has(eventName, options.when)) {
                                this.off(eventName)
                                    .on(eventName, options.when[eventName]);
                            }

                    return this;
                }

            },

            /**
             * @return {string} The current version.
             **/
            version: function () {

                return version;

            },


            resizeViewport: function () {

                // Calculate the width and height of a square within another
                // Calcula a largura e altura de um quadrado dentro de outro
                // width / height = proportion (proportion > 1 == landscape; proportion < 1 == portrait; proportion === 1 == square)
                function calculateBound(d) {

                    var bound = {
                        width: d.width,
                        height: d.height
                    };

                    if (bound.width > d.boundWidth || bound.height > d.boundHeight) {

                        var rel = bound.width / bound.height;

                        if (d.boundWidth / rel > d.boundHeight && d.boundHeight * rel <= d.boundWidth) {

                            bound.width = Math.round(d.boundHeight * rel);
                            bound.height = d.boundHeight;

                        } else {

                            bound.width = d.boundWidth;
                            bound.height = Math.round(d.boundWidth / rel);

                        }
                    }

                    return bound;
                }

                var windowWidth = $(window).width(),
                    windowHeight = $(window).height(),
                    options = this.data().options;

                this.css({
                    width: windowWidth * 0.9,
                    height: windowHeight * 0.9
                });

                console.log(options.$elem);

                var bound = calculateBound({
                    width: options.width,
                    height: options.height,
                    boundWidth: Math.min(options.width, windowWidth),
                    boundHeight: Math.min(options.height, windowHeight)
                });

                options.$elem.turn('size', Math.floor(bound.width * 0.9), Math.floor(bound.height * 0.9));

                if (options.$elem.turn('page') == 1)
                    options.$elem.turn('peel', 'br');

                if (bound.width != this.width() || bound.height != this.height()) {
                    this.turn('size', Math.floor(bound.width * 0.9), Math.floor(bound.height * 0.9));
                }

            } // /resizeViewport
        },

        // Methods and properties for the flip page effect
        flipMethods = {
            // Constructor
            init: function (options) {

                this.data({
                    f: {
                        disabled: false,
                        hover: false,
                        effect: (this.hasClass('hard')) ? 'hard' : 'sheet'
                    }
                });

                this.flip('options', options);

                flipMethods._addPageWrapper.call(this);

                return this;
            },

            setData: function (d) {

                var data = this.data();

                data.f = $.extend(data.f, d);

                return this;
            },

            options: function (options) {

                var data = this.data()
                    .f;

                if (options) {
                    flipMethods.setData.call(this, {
                        options: $.extend({}, data.options || flipOptions, options)
                    });
                    return this;
                } else
                    return data.options;

            },

            z: function (z) {

                var data = this.data()
                    .f;

                data.options['z-index'] = z;

                if (data.fwrapper)
                    data.fwrapper.css({
                        zIndex: z || parseInt(data.parent.css('z-index'), 10) || 0
                    });

                return this;
            },

            _cAllowed: function () {

                var data = this.data()
                    .f,
                    page = data.options.page,
                    turnData = data.options.turn.data(),
                    isOdd = page % 2 > 0;

                if (data.effect == 'hard') {

                    return (turnData.direction == 'ltr') ? [isOdd ? 'r' : 'l'] : [isOdd ? 'l' : 'r'];

                } else {

                    if (turnData.display == 'single') {

                        if (page == 1)
                            return (turnData.direction == 'ltr') ?
                                corners.forward : corners.backward;
                        else if (page == turnData.totalPages)
                            return (turnData.direction == 'ltr') ?
                                corners.backward : corners.forward;
                        else
                            return corners.all;

                    } else {

                        return (turnData.direction == 'ltr') ?
                            corners[isOdd ? 'forward' : 'backward'] :
                            corners[isOdd ? 'backward' : 'forward'];

                    }

                }

            },

            _cornerActivated: function (p) {

                var data = this.data()
                    .f,
                    width = this.width(),
                    height = this.height(),
                    point = {
                        x: p.x,
                        y: p.y,
                        corner: ''
                    },
                    csz = data.options.cornerSize;

                if (point.x <= 0 || point.y <= 0 || point.x >= width || point.y >= height)
                    return false;

                var allowedCorners = flipMethods._cAllowed.call(this);

                switch (data.effect) {
                    case 'hard':

                        if (point.x > width - csz)
                            point.corner = 'r';
                        else if (point.x < csz)
                            point.corner = 'l';
                        else
                            return false;

                        break;

                    case 'sheet':

                        if (point.y < csz)
                            point.corner += 't';
                        else if (point.y >= height - csz)
                            point.corner += 'b';
                        else
                            return false;

                        if (point.x <= csz)
                            point.corner += 'l';
                        else if (point.x >= width - csz)
                            point.corner += 'r';
                        else
                            return false;

                        break;
                }

                return (!point.corner || $.inArray(point.corner, allowedCorners) == -1) ?
                    false : point;

            },

            _isIArea: function (e) {

                var pos = this.data()
                    .f.parent.offset();

                e = (isTouch && e.originalEvent) ? e.originalEvent.touches[0] : e;

                return flipMethods._cornerActivated.call(this, {
                    x: e.pageX - pos.left,
                    y: e.pageY - pos.top
                });

            },

            _c: function (corner, options) {

                options = options || 0;

                switch (corner) {
                    case 'tl':
                        return point2D(options, options);
                    case 'tr':
                        return point2D(this.width() - options, options);
                    case 'bl':
                        return point2D(options, this.height() - options);
                    case 'br':
                        return point2D(this.width() - options, this.height() - options);
                    case 'l':
                        return point2D(options, 0);
                    case 'r':
                        return point2D(this.width() - options, 0);
                }

            },

            _c2: function (corner) {

                switch (corner) {
                    case 'tl':
                        return point2D(this.width() * 2, 0);
                    case 'tr':
                        return point2D(-this.width(), 0);
                    case 'bl':
                        return point2D(this.width() * 2, this.height());
                    case 'br':
                        return point2D(-this.width(), this.height());
                    case 'l':
                        return point2D(this.width() * 2, 0);
                    case 'r':
                        return point2D(-this.width(), 0);
                }

            },

            _foldingPage: function () {

                var data = this.data()
                    .f;

                if (!data)
                    return;

                var options = data.options;

                if (options.turn) {
                    data = options.turn.data();
                    if (data.display == 'single')
                        return (options.next > 1 || options.page > 1) ? data.pageObjs[0] : null;
                    else
                        return data.pageObjs[options.next];
                }

            },

            _backGradient: function () {

                var data = this.data()
                    .f,
                    turnData = data.options.turn.data(),
                    gradient = turnData.options.gradients && (turnData.display == 'single' || (data.options.page != 2 && data.options.page != turnData.totalPages - 1));

                if (gradient && !data.bshadow) {
                    data.bshadow = $('<div>', divStyle(0, 0, 1))
                        .css({
                            position: '',
                            width: this.width(),
                            height: this.height()
                        })
                        .appendTo(data.parent);
                }

                return gradient;

            },

            type: function () {

                return this.data()
                    .f.effect;

            },

            resize: function (full) {

                var data = this.data()
                    .f,
                    turnData = data.options.turn.data(),
                    width = this.width(),
                    height = this.height();

                switch (data.effect) {
                    case 'hard':

                        if (full) {
                            data.wrapper.css({
                                width: width,
                                height: height
                            });
                            data.fpage.css({
                                width: width,
                                height: height
                            });
                            if (turnData.options.gradients) {
                                data.ashadow.css({
                                    width: width,
                                    height: height
                                });
                                data.bshadow.css({
                                    width: width,
                                    height: height
                                });
                            }
                        }

                        break;
                    case 'sheet':

                        if (full) {
                            var size = Math.round(Math.sqrt(Math.pow(width, 2) + Math.pow(height, 2)));

                            data.wrapper
                                .css({
                                    width: size,
                                    height: size
                                });
                            data.fwrapper
                                .css({
                                    width: size,
                                    height: size
                                })
                                .children(':first-child')
                                .css({
                                    width: width,
                                    height: height
                                });

                            data.fpage
                                .css({
                                    width: width,
                                    height: height
                                });

                            if (turnData.options.gradients)
                                data.ashadow.css({
                                    width: width,
                                    height: height
                                });

                            if (flipMethods._backGradient.call(this))
                                data.bshadow.css({
                                    width: width,
                                    height: height
                                });
                        }

                        if (data.parent.is(':visible')) {

                            var offset = data.parent.offset();

                            console.log(data.fwrapper);
                            console.log(offset);

                            data.fwrapper.css({
                                top: offset.top,
                                left: offset.left
                            });

                            //if (data.options.turn) {
                            offset = data.options.turn.offset();
                            data.fparent.css({
                                top: -offset.top,
                                left: -offset.left
                            });
                            //}
                        }

                        this.flip('z', data.options['z-index']);

                        break;
                }

            },

            // Prepares the page by adding a general wrapper and another objects

            _addPageWrapper: function () {

                var att,
                    data = this.data().f,
                    turnData = data.options.turn.data(),
                    parent = this.parent();

                data.parent = parent;

                if (!data.wrapper)
                    switch (data.effect) {
                        case 'hard':

                            var cssProperties = {};
                            cssProperties[vendor + 'transform-style'] = 'preserve-3d';
                            cssProperties[vendor + 'backface-visibility'] = 'hidden';

                            data.wrapper = $('<div>', divStyle(0, 0, 2))
                                .css(cssProperties)
                                .appendTo(parent)
                                .prepend(this);

                            data.fpage = $('<div>', divStyle(0, 0, 1))
                                .css(cssProperties)
                                .appendTo(parent);

                            if (turnData.options.gradients) {
                                data.ashadow = $('<div>', divStyle(0, 0, 0))
                                    .hide()
                                    .appendTo(parent);

                                data.bshadow = $('<div>', divStyle(0, 0, 0));
                            }

                            break;
                        case 'sheet':

                            var width = this.width(),
                                height = this.height(),
                                size = Math.round(Math.sqrt(Math.pow(width, 2) + Math.pow(height, 2)));

                            data.fparent = data.options.turn.data()
                                .fparent;

                            if (!data.fparent) {
                                var fparent = $('<div>', {
                                    css: {
                                        'pointer-events': 'none'
                                    }
                                })
                                    .hide();
                                fparent.data()
                                    .flips = 0;
                                fparent.css(divStyle(0, 0, 'auto', 'visible')
                                    .css)
                                    .appendTo(data.options.turn);

                                data.options.turn.data()
                                    .fparent = fparent;
                                data.fparent = fparent;
                            }

                            this.css({
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                bottom: 'auto',
                                right: 'auto'
                            });

                            data.wrapper = $('<div>', divStyle(0, 0, this.css('z-index')))
                                .appendTo(parent)
                                .prepend(this);

                            data.fwrapper = $('<div>', divStyle(parent.offset()
                                .top, parent.offset()
                                    .left))
                                .hide()
                                .appendTo(data.fparent);

                            data.fpage = $('<div>', divStyle(0, 0, 0, 'visible'))
                                .css({
                                    cursor: 'default'
                                })
                                .appendTo(data.fwrapper);

                            if (turnData.options.gradients)
                                data.ashadow = $('<div>', divStyle(0, 0, 1))
                                    .appendTo(data.fpage);

                            flipMethods.setData.call(this, data);

                            break;
                    }

                // Set size
                flipMethods.resize.call(this, true);

            },

            // Takes a 2P point from the screen and applies the transformation

            _fold: function (point) {

                var data = this.data()
                    .f,
                    turnData = data.options.turn.data(),
                    o = flipMethods._c.call(this, point.corner),
                    width = this.width(),
                    height = this.height();

                switch (data.effect) {

                    case 'hard':

                        if (point.corner == 'l')
                            point.x = Math.min(Math.max(point.x, 0), width * 2);
                        else
                            point.x = Math.max(Math.min(point.x, width), -width);

                        var leftPos,
                            shadow,
                            gradientX,
                            fpageOrigin,
                            parentOrigin,
                            totalPages = turnData.totalPages,
                            zIndex = data.options['z-index'] || totalPages,
                            parentCss = {
                                'overflow': 'visible'
                            },
                            relX = (o.x) ? (o.x - point.x) / width : point.x / width,
                            angle = relX * 90,
                            half = angle < 90;

                        switch (point.corner) {
                            case 'l':

                                fpageOrigin = '0% 50%';
                                parentOrigin = '100% 50%';

                                if (half) {
                                    leftPos = 0;
                                    shadow = data.options.next - 1 > 0;
                                    gradientX = 1;
                                } else {
                                    leftPos = '100%';
                                    shadow = data.options.page + 1 < totalPages;
                                    gradientX = 0;
                                }

                                break;
                            case 'r':

                                fpageOrigin = '100% 50%';
                                parentOrigin = '0% 50%';
                                angle = -angle;
                                width = -width;

                                if (half) {
                                    leftPos = 0;
                                    shadow = data.options.next + 1 < totalPages;
                                    gradientX = 0;
                                } else {
                                    leftPos = '-100%';
                                    shadow = data.options.page != 1;
                                    gradientX = 1;
                                }

                                break;
                        }

                        parentCss[vendor + 'perspective-origin'] = parentOrigin;

                        data.wrapper.transform('rotateY(' + angle + 'deg) translate3d(0px, 0px, ' + this.attr('depth') || 0 + 'px)', parentOrigin);

                        data.fpage.transform('translateX(' + width + 'px) rotateY(' + (180 + angle) + 'deg)', fpageOrigin);

                        data.parent.css(parentCss);

                        if (half) {
                            relX = -relX + 1;
                            data.wrapper.css({
                                zIndex: zIndex + 1
                            });
                            data.fpage.css({
                                zIndex: zIndex
                            });
                        } else {
                            relX = relX - 1;
                            data.wrapper.css({
                                zIndex: zIndex
                            });
                            data.fpage.css({
                                zIndex: zIndex + 1
                            });
                        }

                        if (turnData.options.gradients) {

                            if (shadow) {
                                data.ashadow.css({
                                    display: '',
                                    left: leftPos,
                                    backgroundColor: 'rgba(0,0,0,' + (0.5 * relX) + ')'
                                }).transform('rotateY(0deg)');
                            } else {
                                data.ashadow.hide();
                            }

                            data.bshadow.css({
                                opacity: -relX + 1
                            });

                            if (half) {
                                if (data.bshadow.parent()[0] != data.wrapper[0]) {
                                    data.bshadow.appendTo(data.wrapper);
                                }
                            } else {
                                if (data.bshadow.parent()[0] != data.fpage[0]) {
                                    data.bshadow.appendTo(data.fpage);
                                }
                            }

                            gradient(data.bshadow,
                                point2D(gradientX * 100, 0),
                                point2D((-gradientX + 1) * 100, 0), [
                                    [0, 'rgba(0,0,0,0.3)'],
                                    [1, 'rgba(0,0,0,0)']
                                ], 2);

                        }

                        break;
                    case 'sheet':

                        var that = this,
                            a = 0,
                            alpha = 0,
                            beta,
                            px,
                            gradientEndPointA,
                            gradientEndPointB,
                            gradientStartVal,
                            gradientSize,
                            gradientOpacity,
                            shadowVal,
                            mv = point2D(0, 0),
                            df = point2D(0, 0),
                            tr = point2D(0, 0),
                            folding = flipMethods._foldingPage.call(this),
                            tan = Math.tan(alpha),
                            ac = turnData.options.acceleration,
                            h = data.wrapper.height(),
                            top = point.corner.substr(0, 1) == 't',
                            left = point.corner.substr(1, 1) == 'l',

                            compute = function () {

                                var rel = point2D(0, 0);
                                var middle = point2D(0, 0);

                                rel.x = (o.x) ? o.x - point.x : point.x;

                                if (!hasRot) {
                                    rel.y = 0;
                                } else {
                                    rel.y = (o.y) ? o.y - point.y : point.y;
                                }

                                middle.x = (left) ? width - rel.x / 2 : point.x + rel.x / 2;
                                middle.y = rel.y / 2;

                                var alpha = A90 - Math.atan2(rel.y, rel.x),
                                    gamma = alpha - Math.atan2(middle.y, middle.x),
                                    distance = Math.max(0, Math.sin(gamma) * Math.sqrt(Math.pow(middle.x, 2) + Math.pow(middle.y, 2)));

                                a = deg(alpha);

                                tr = point2D(distance * Math.sin(alpha), distance * Math.cos(alpha));

                                if (alpha > A90) {
                                    tr.x = tr.x + Math.abs(tr.y * rel.y / rel.x);
                                    tr.y = 0;
                                    if (Math.round(tr.x * Math.tan(PI - alpha)) < height) {
                                        point.y = Math.sqrt(Math.pow(height, 2) + 2 * middle.x * rel.x);
                                        if (top) point.y = height - point.y;
                                        return compute();
                                    }
                                }

                                if (alpha > A90) {
                                    var beta = PI - alpha,
                                        dd = h - height / Math.sin(beta);
                                    mv = point2D(Math.round(dd * Math.cos(beta)), Math.round(dd * Math.sin(beta)));
                                    if (left) mv.x = -mv.x;
                                    if (top) mv.y = -mv.y;
                                }

                                px = Math.round(tr.y / Math.tan(alpha) + tr.x);

                                var side = width - px,
                                    sideX = side * Math.cos(alpha * 2),
                                    sideY = side * Math.sin(alpha * 2);
                                df = point2D(
                                    Math.round((left ? side - sideX : px + sideX)),
                                    Math.round((top) ? sideY : height - sideY));

                                // Gradients
                                if (turnData.options.gradients) {

                                    gradientSize = side * Math.sin(alpha);

                                    var endingPoint = flipMethods._c2.call(that, point.corner),
                                        far = Math.sqrt(Math.pow(endingPoint.x - point.x, 2) + Math.pow(endingPoint.y - point.y, 2)) / width;

                                    shadowVal = Math.sin(A90 * ((far > 1) ? 2 - far : far));

                                    gradientOpacity = Math.min(far, 1);


                                    gradientStartVal = gradientSize > 100 ? (gradientSize - 100) / gradientSize : 0;

                                    gradientEndPointA = point2D(
                                        gradientSize * Math.sin(alpha) / width * 100,
                                        gradientSize * Math.cos(alpha) / height * 100);


                                    if (flipMethods._backGradient.call(that)) {

                                        gradientEndPointB = point2D(
                                            gradientSize * 1.2 * Math.sin(alpha) / width * 100,
                                            gradientSize * 1.2 * Math.cos(alpha) / height * 100);

                                        if (!left) gradientEndPointB.x = 100 - gradientEndPointB.x;
                                        if (!top) gradientEndPointB.y = 100 - gradientEndPointB.y;

                                    }

                                }

                                tr.x = Math.round(tr.x);
                                tr.y = Math.round(tr.y);

                                return true;
                            },

                            transform = function (tr, c, x, a) {

                                var f = ['0', 'auto'],
                                    mvW = (width - h) * x[0] / 100,
                                    mvH = (height - h) * x[1] / 100,
                                    cssA = {
                                        left: f[c[0]],
                                        top: f[c[1]],
                                        right: f[c[2]],
                                        bottom: f[c[3]]
                                    },
                                    cssB = {},
                                    aliasingFk = (a != 90 && a != -90) ? (left ? -1 : 1) : 0,
                                    origin = x[0] + '% ' + x[1] + '%';

                                that.css(cssA)
                                    .transform(cssRotateString(a) + cssTranslateString(tr.x + aliasingFk, tr.y, ac), origin);

                                data.fpage
                                    .css(cssA)
                                    .transform(
                                    cssRotateString(a) +
                                    cssTranslateString(tr.x + df.x - mv.x - width * x[0] / 100, tr.y + df.y - mv.y - height * x[1] / 100, ac) +
                                    cssRotateString((180 / a - 2) * a),
                                    origin);

                                data.wrapper
                                    .transform(cssTranslateString(-tr.x + mvW - aliasingFk, -tr.y + mvH, ac) + cssRotateString(-a), origin);

                                data.fwrapper
                                    .transform(cssTranslateString(-tr.x + mv.x + mvW, -tr.y + mv.y + mvH, ac) + cssRotateString(-a), origin);

                                if (turnData.options.gradients) {

                                    if (x[0])
                                        gradientEndPointA.x = 100 - gradientEndPointA.x;

                                    if (x[1])
                                        gradientEndPointA.y = (100 - gradientEndPointA.y);

                                    cssB['box-shadow'] = '0 0 20px rgba(0,0,0,' + (0.5 * shadowVal) + ')';

                                    folding.css(cssB);

                                    gradient(data.ashadow,
                                        point2D(left ? 100 : 0, top ? 0 : 100),
                                        point2D(gradientEndPointA.x, gradientEndPointA.y), [
                                            [gradientStartVal, 'rgba(0,0,0,0)'],
                                            [((1 - gradientStartVal) * 0.8) + gradientStartVal, 'rgba(0,0,0,' + (0.2 * gradientOpacity) + ')'],
                                            [1, 'rgba(255,255,255,' + (0.2 * gradientOpacity) + ')']
                                        ], 3, alpha);

                                    if (flipMethods._backGradient.call(that))
                                        gradient(data.bshadow,
                                            point2D(left ? 0 : 100, top ? 0 : 100),
                                            point2D(gradientEndPointB.x, gradientEndPointB.y), [
                                                [0.6, 'rgba(0,0,0,0)'],
                                                [0.8, 'rgba(0,0,0,' + (0.3 * gradientOpacity) + ')'],
                                                [1, 'rgba(0,0,0,0)']
                                            ], 3);
                                }

                            };

                        switch (point.corner) {
                            case 'tl':
                                point.x = Math.max(point.x, 1);
                                compute();
                                transform(tr, [1, 0, 0, 1], [100, 0], a);
                                break;
                            case 'tr':
                                point.x = Math.min(point.x, width - 1);
                                compute();
                                transform(point2D(-tr.x, tr.y), [0, 0, 0, 1], [0, 0], -a);
                                break;
                            case 'bl':
                                point.x = Math.max(point.x, 1);
                                compute();
                                transform(point2D(tr.x, -tr.y), [1, 1, 0, 0], [100, 100], -a);
                                break;
                            case 'br':
                                point.x = Math.min(point.x, width - 1);
                                compute();
                                transform(point2D(-tr.x, -tr.y), [0, 1, 1, 0], [0, 100], a);
                                break;
                            default:
                                break;
                        }

                        break;

                }

                data.point = point;

            },

            _moveFoldingPage: function (move) {

                var data = this.data().f;

                if (!data)
                    return;

                var turn = data.options.turn,
                    turnData = turn.data(),
                    place = turnData.pagePlace;

                if (move) {

                    var nextPage = data.options.next;

                    if (place[nextPage] != data.options.page) {

                        if (data.folding)
                            flipMethods._moveFoldingPage.call(this, false);

                        var folding = flipMethods._foldingPage.call(this);

                        folding.appendTo(data.fpage);
                        place[nextPage] = data.options.page;
                        data.folding = nextPage;
                    }

                    turn.turn('update');

                } else {

                    if (data.folding) {

                        if (turnData.pages[data.folding]) {

                            // If we have flip available

                            var flipData = turnData.pages[data.folding].data().f;

                            turnData.pageObjs[data.folding].appendTo(flipData.wrapper);

                        } else if (turnData.pageWrap[data.folding]) {

                            // If we have the pageWrapper

                            turnData.pageObjs[data.folding].appendTo(turnData.pageWrap[data.folding]);

                        }

                        if (data.folding in place) {
                            place[data.folding] = data.folding;
                        }

                        delete data.folding;

                    }
                }
            },

            _showFoldedPage: function (c, animate) {

                var folding = flipMethods._foldingPage.call(this),
                    dd = this.data(),
                    data = dd.f,
                    visible = data.visible;

                if (folding) {

                    if (!visible || !data.point || data.point.corner != c.corner) {

                        var corner = data.status == 'hover' || data.status == 'peel' || data.options.turn.data().mouseAction ? c.corner : null;

                        visible = false;

                        if (trigger('start', this, [data.options, corner]) == 'prevented')
                            return false;

                    }

                    if (animate) {

                        var that = this,
                            point = (data.point && data.point.corner == c.corner) ?
                                data.point : flipMethods._c.call(this, c.corner, 1);

                        this.animatef({
                            from: [point.x, point.y],
                            to: [c.x, c.y],
                            duration: 500,
                            frame: function (v) {
                                c.x = Math.round(v[0]);
                                c.y = Math.round(v[1]);
                                flipMethods._fold.call(that, c);
                            }
                        });

                    } else {

                        flipMethods._fold.call(this, c);

                        if (dd.effect && !dd.effect.turning)
                            this.animatef(false);

                    }

                    if (!visible) {

                        switch (data.effect) {
                            case 'hard':

                                data.visible = true;
                                flipMethods._moveFoldingPage.call(this, true);
                                data.fpage.show();
                                if (data.options.shadows)
                                    data.bshadow.show();

                                break;
                            case 'sheet':

                                data.visible = true;
                                data.fparent.show()
                                    .data()
                                    .flips++;
                                flipMethods._moveFoldingPage.call(this, true);
                                data.fwrapper.show();
                                if (data.bshadow)
                                    data.bshadow.show();

                                break;
                        }

                    }

                    return true;

                }

                return false;
            },

            hide: function () {

                var data = this.data().f,
                    turnData = data.options.turn.data(),
                    folding = flipMethods._foldingPage.call(this);

                switch (data.effect) {
                    case 'hard':

                        if (turnData.options.gradients) {
                            data.bshadowLoc = 0;
                            data.bshadow.remove();
                            data.ashadow.hide();
                        }

                        data.wrapper.transform();
                        data.fpage.hide();

                        break;
                    case 'sheet':

                        if (data.fparent.data().flips - 1 === 0)
                            data.fparent.hide();

                        this.css({
                            left: 0,
                            top: 0,
                            right: 'auto',
                            bottom: 'auto'
                        })
                            .transform();

                        data.wrapper.transform();

                        data.fwrapper.hide();

                        if (data.bshadow)
                            data.bshadow.hide();

                        folding.transform();

                        break;
                }

                data.visible = false;

                return this;
            },

            hideFoldedPage: function (animate) {

                var data = this.data()
                    .f;

                if (!data.point) return;

                var that = this,
                    p1 = data.point,
                    hide = function () {
                        data.point = null;
                        data.status = '';
                        that.flip('hide');
                        that.trigger('end', [data.options, false]);
                    };

                if (animate) {

                    var p4 = flipMethods._c.call(this, p1.corner),
                        top = (p1.corner.substr(0, 1) == 't'),
                        delta = (top) ? Math.min(0, p1.y - p4.y) / 2 : Math.max(0, p1.y - p4.y) / 2,
                        p2 = point2D(p1.x, p1.y + delta),
                        p3 = point2D(p4.x, p4.y - delta);

                    this.animatef({
                        from: 0,
                        to: 1,
                        frame: function (v) {
                            var np = bezier(p1, p2, p3, p4, v);
                            p1.x = np.x;
                            p1.y = np.y;
                            flipMethods._fold.call(that, p1);
                        },
                        complete: hide,
                        duration: 800,
                        hiding: true
                    });

                } else {

                    this.animatef(false);
                    hide();

                }
            },

            turnPage: function (corner) {

                var that = this,
                    data = this.data().f,
                    turnData = data.options.turn.data();

                corner = {
                    corner: (data.corner) ? data.corner.corner : (corner || flipMethods._cAllowed.call(this)[0])
                };

                var p1 = data.point || flipMethods._c.call(this, corner.corner, (data.options.turn) ? turnData.options.elevation : 0),
                    p4 = flipMethods._c2.call(this, corner.corner);

                this.trigger('flip')
                    .animatef({
                        from: 0,
                        to: 1,
                        frame: function (v) {

                            var np = bezier(p1, p1, p4, p4, v);
                            corner.x = np.x;
                            corner.y = np.y;
                            flipMethods._showFoldedPage.call(that, corner);

                        },
                        complete: function () {

                            that.trigger('end', [data.options, true]);

                        },
                        duration: turnData.options.duration,
                        turning: true
                    });

                data.corner = null;
            },

            moving: function () {

                return 'effect' in this.data();

            },

            isTurning: function () {

                return this.flip('moving') && this.data()
                    .effect.turning;

            },

            corner: function () {

                return this.data()
                    .f.corner;

            },

            _eventStart: function (e) {

                var data = this.data()
                    .f,
                    turn = data.options.turn;

                if (!data.corner && !data.disabled && !this.flip('isTurning') &&
                    data.options.page == turn.data()
                        .pagePlace[data.options.page]) {

                    data.corner = flipMethods._isIArea.call(this, e);

                    if (data.corner && flipMethods._foldingPage.call(this)) {

                        this.trigger('pressed', [data.point]);
                        flipMethods._showFoldedPage.call(this, data.corner);

                        return false;

                    } else
                        data.corner = null;

                }

            },

            _eventMove: function (e) {

                var data = this.data()
                    .f;

                if (!data.disabled) {

                    e = (isTouch) ? e.originalEvent.touches : [e];

                    if (data.corner) {

                        var pos = data.parent.offset();
                        data.corner.x = e[0].pageX - pos.left;
                        data.corner.y = e[0].pageY - pos.top;
                        flipMethods._showFoldedPage.call(this, data.corner);

                    } else if (data.hover && !this.data()
                        .effect && this.is(':visible')) {

                        var point = flipMethods._isIArea.call(this, e[0]);

                        if (point) {

                            if ((data.effect == 'sheet' && point.corner.length == 2) || data.effect == 'hard') {
                                data.status = 'hover';
                                var origin = flipMethods._c.call(this, point.corner, data.options.cornerSize / 2);
                                point.x = origin.x;
                                point.y = origin.y;
                                flipMethods._showFoldedPage.call(this, point, true);
                            }

                        } else {

                            if (data.status == 'hover') {
                                data.status = '';
                                flipMethods.hideFoldedPage.call(this, true);
                            }

                        }

                    }

                }

            },

            _eventEnd: function () {

                var data = this.data()
                    .f,
                    corner = data.corner;

                if (!data.disabled && corner) {
                    if (trigger('released', this, [data.point || corner]) != 'prevented') {
                        flipMethods.hideFoldedPage.call(this, true);
                    }
                }

                data.corner = null;

            },

            disable: function (disable) {

                flipMethods.setData.call(this, {
                    'disabled': disable
                });
                return this;

            },

            hover: function (hover) {

                flipMethods.setData.call(this, {
                    'hover': hover
                });
                return this;

            },

            peel: function (corner, animate) {

                var data = this.data()
                    .f;

                if (corner) {

                    if ($.inArray(corner, corners.all) == -1)
                        throw new Error('Corner "' + corner + '" is not valid.');

                    if ($.inArray(corner, flipMethods._cAllowed.call(this)) != -1) {

                        var point = flipMethods._c.call(this, corner, data.options.cornerSize / 2);

                        data.status = 'peel';

                        flipMethods._showFoldedPage.call(this, {
                            corner: corner,
                            x: point.x,
                            y: point.y
                        }, animate);

                    }


                } else {

                    data.status = '';

                    flipMethods.hideFoldedPage.call(this, animate);

                }

                return this;
            }
        };


    // Processes classes
    function dec(elem, methods, args) {
        if (!args[0] || typeof (args[0]) == 'object')
            return methods.init.apply(elem, args);
        else if (methods[args[0]] !== undefined)
            return methods[args[0]].apply(elem, Array.prototype.slice.call(args, 1)); // Array.prototype.slice will convert the arguments object
        else
            throw new Error('"' + args[0] + '" is not a method or property.');
        return false;
    }


    // Attributes for a layer
    function divStyle(top, left, zIndex, overflow) {
        return {
            css: {
                position: 'absolute',
                top: top,
                left: left,
                overflow: overflow || 'hidden',
                zIndex: zIndex || 'auto'
            }
        };

    }

    // Gets a 2D point from a bezier curve of four points

    function bezier(p1, p2, p3, p4, t) {

        var a = 1 - t,
            b = a * a * a,
            c = t * t * t;

        return point2D(Math.round(b * p1.x + 3 * t * a * a * p2.x + 3 * t * t * a * p3.x + c * p4.x),
            Math.round(b * p1.y + 3 * t * a * a * p2.y + 3 * t * t * a * p3.y + c * p4.y));

    }

    /**
     * @description Converts an angle from degrees to radians
     * @param {int|string} degress : The number in degress to be converted to radians.
     * @return {int|float} A radian number.
     */
    function rad(degrees) {
        return degrees / 180 * PI;
    }

    /**
     * @description Converts an angle from radians to degrees
     * @param {int|string} radians : The number in radians to be converted to degress.
     * @return {int|float} A degree number.
     */
    function deg(radians) {
        return radians / PI * 180;
    }

    /** 
     * @description Gets a 2D point
     * @param {int|float} x
     * @param {int|float} y
     * @return {object}
     */
    function point2D(x, y) {
        return {
            x: x,
            y: y
        };
    }

    /**
     * @description Webkit 534.3 on Android wrongly repaints elements that use overflow:hidden + rotation
     **/
    function rotationAvailable() {
        var parts = /AppleWebkit\/([0-9\.]+)/i.exec(navigator.userAgent);
        return (parts) ? parseFloat(parts[1]) > 534.3 : true; // parseFloat = webkitVersion;
    }

    /**
     * @param x 
     * @param y 
     * @param use3d
     * @return {string} A CSS `translate3d` string function.
     **/
    function cssTranslateString(x, y, use3d) {

        return ' translate3d(' + x + 'px,' + y + 'px' + (has3d && use3d ? '' : ',0') + ') ';

    }

    /**
     * @return {string} A CSS `rotation` string function.
     **/
    function cssRotateString(degrees) {
        return ' rotate(' + degrees + 'deg) ';
    }

    /**
     * @description Checks if a property belongs to an object.
     * @param {string} property : The property index to check.
     * @param {Object} object : Object who should have the property.
     * @return {boolean} 
     **/
    function has(property, object) {
        return Object.prototype.hasOwnProperty.call(object, property);
    }

    /**
     * @return {string} The CSS3 vendor prefix.
     **/
    function getCSSVendorPrefix() {

        var vendorPrefixes = ['Moz', 'Webkit', 'Khtml', 'O', 'ms'],
            len = vendorPrefixes.length,
            vendor = '';

        while (len--)
            if ((vendorPrefixes[len] + 'Transform') in document.body.style)
                vendor = '-' + vendorPrefixes[len].toLowerCase() + '-';

        return vendor;

    }

    /**
     * @description Detects the transitionEnd Event
     **/
    function getTransitionEnd() {

        var t,
            elem = document.createElement('fakeelement'),
            transitions = {
                'transition': 'transitionend',
                'OTransition': 'oTransitionEnd',
                'MSTransition': 'transitionend',
                'MozTransition': 'transitionend',
                'WebkitTransition': 'webkitTransitionEnd'
            };

        for (t in transitions) {
            if (elem.style[t] !== undefined) {
                return transitions[t];
            }
        }
    }

    // Gradients
    function gradient($elem, p0, p1, colors, numColors) {

        var j, cols = [];

        if (vendor == '-webkit-') {

            for (j = 0; j < numColors; j++)
                cols.push('color-stop(' + colors[j][0] + ', ' + colors[j][1] + ')');

            $elem.css({
                'background-image': '-webkit-gradient(linear, ' +
                p0.x + '% ' +
                p0.y + '%,' +
                p1.x + '% ' +
                p1.y + '%, ' +
                cols.join(',') + ' )'
            });
        } else {
            p0 = {
                x: p0.x / 100 * $elem.width(),
                y: p0.y / 100 * $elem.height()
            };
            p1 = {
                x: p1.x / 100 * $elem.width(),
                y: p1.y / 100 * $elem.height()
            };

            var dx = p1.x - p0.x,
                dy = p1.y - p0.y,
                angle = Math.atan2(dy, dx),
                angle2 = angle - Math.PI / 2,
                diagonal = Math.abs($elem.width() * Math.sin(angle2)) + Math.abs($elem.height() * Math.cos(angle2)),
                gradientDiagonal = Math.sqrt(dy * dy + dx * dx),
                corner = point2D((p1.x < p0.x) ? $elem.width() : 0, (p1.y < p0.y) ? $elem.height() : 0),
                slope = Math.tan(angle),
                inverse = -1 / slope,
                x = (inverse * corner.x - corner.y - slope * p0.x + p0.y) / (inverse - slope),
                c = {
                    x: x,
                    y: inverse * x - inverse * corner.x + corner.y
                },
                segA = (Math.sqrt(Math.pow(c.x - p0.x, 2) + Math.pow(c.y - p0.y, 2)));

            for (j = 0; j < numColors; j++)
                cols.push(' ' + colors[j][1] + ' ' + ((segA + gradientDiagonal * colors[j][0]) * 100 / diagonal) + '%');

            $elem.css({
                'background-image': vendor + 'linear-gradient(' + (-angle) + 'rad,' + cols.join(',') + ')'
            });
        }
    }


    // Triggers an event
    function trigger(eventName, context, args) {

        var event = $.Event(eventName);
        context.trigger(event, args);

        if (event.isDefaultPrevented()) {
            return 'prevented';
        } else if (event.isPropagationStopped()) {
            return 'stopped';
        }

        return '';
    }

    // Request an animation
    window.requestAnim = (function () {
        return window.requestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            window.oRequestAnimationFrame ||
            window.msRequestAnimationFrame ||
            function (callback) {
                window.setTimeout(callback, 1000 / 60);
            };
    })();

    // Extend $.fn
    $.extend($.fn, {

        flip: function () {
            return dec(this, flipMethods, arguments);
        },

        turn: function () {
            return dec(this, turnMethods, arguments);
        },

        transform: function (transform, origin) {

            return this.css({
                transformOrigin: origin,
                transform: transform
            });

        },

        animatef: function (point) {

            var data = this.data();

            if (data.effect) {
                data.effect.stop();
            }

            if (point) {

                if (!point.to.length) point.to = [point.to];
                if (!point.from.length) point.from = [point.from];

                var diff = [],
                    len = point.to.length,
                    animating = true,
                    that = this,
                    time = (new Date())
                        .getTime(),
                    frame = function () {

                        if (!data.effect || !animating)
                            return;

                        var v = [],
                            timeDiff = Math.min(point.duration, (new Date())
                                .getTime() - time);

                        for (var i = 0; i < len; i++)
                            v.push(data.effect.easing(1, timeDiff, point.from[i], diff[i], point.duration));

                        point.frame((len == 1) ? v[0] : v);

                        if (timeDiff == point.duration) {
                            delete data.effect;
                            that.data(data);
                            if (point.complete)
                                point.complete();
                        } else {
                            window.requestAnim(frame);
                        }
                    };

                for (var i = 0; i < len; i++)
                    diff.push(point.to[i] - point.from[i]);

                data.effect = $.extend({
                    stop: function () {
                        animating = false;
                    },
                    easing: function (x, t, b, c, data) {
                        return c * Math.sqrt(1 - (t = t / data - 1) * t) + b;
                    }
                }, point);

                this.data(data);

                frame();

            } else {

                delete data.effect;

            }
        }
    });

})(window.jQuery || false, window, document);
