/**
 * weblitz-plateview - Weblitz plate viewport
 *
 * Depends on jquery
 *
 * Copyright (c) 2011 Glencoe Software, Inc. All rights reserved.
 *
 * This software is distributed under the terms described by the LICENCE file
 * you can find at the root of the distribution bundle, which states you are
 * free to use it only for non commercial purposes.
 * If the file is missing please request a copy by contacting
 * jason@glencoesoftware.com.
 *
 * Author: Carlos Neves <carlos(at)glencoesoftware.com>
 */


/**
 * ---- Usage ----
 *
 * - Initializing -
 *
 * plate = jQuery.WeblitzPlateview(elm, options)
 * - elm: the selector for the element to be turned into a plateview container
 * - options: a dictionary, recognized options are
 *   - baseurl: optional prefix path for the json query url (string, url)
 *   - width: the individual well thumbnail width, defaults to 64 (int, pixels)
 *   - height: the individual well thumbnail height, defaults to 48 (int, pixels)
 *   - useParentPrefix: if true, prepends the base container id to the created elements, default true (boolean)
 * - returns the WeblitzPlateview object
 *
 * - Using -
 *
 * plate.load(pid, field)
 * - pid: Plate ID (int)
 * - field: 0 based field index (int)
 *
 * plate.setFocus(elm)
 * - adds the pv-focus css class to the thumb pointed to by the elm jQuery object
 *   removing it from any other thumbnail eventually focused on this plate
 * - elm is the jQuery object for the thumb to be focused
 *
 * plate.rmFocus(elm)
 * - removes the pv-focus css class to the thumb pointed to by the elm jQuery object
 *   or from any thumbnail in this plate if elm is null or undefined
 * - elm is the optional jQuery object for the thumb to loose focused
 *
 * - Events -
 *
 * thumbClick(ev, welldata, thumb)
 * - triggered when there's a mouse click on a thumb.
 * - welldata holds a dictionary holding metadata for the clicked well
 * - thumb is the DOM object for the thumb image
 *
 * thumbLoad(ev, container, thumb)
 * - triggered after each thumbnail image is loaded by the browser
 * - container is the jQuery object of the well container
 * - thumb is the jQuery object for the thumb image
 *
 * thumbNew(ev, welldata, thumb)
 * - triggered when a new thumb is prepared for loading.
 * - welldata holds a dictionary holding metadata for the well
 *   - if you extend of alter welldata in this event handler, the changes will be kept
 *     for thumbClick
 * - thumb is the jQuery object for the thumb image
 *
 * - jQuery obj data attributes -
 *
 * noFocus
 * - if true, prevents css pv-focus class to be added on setFocus
 *
 */


/* Public constructors */

;jQuery.fn.WeblitzPlateview = function (options) {
  return this.each
  (
   function () {
     if (!this.WeblitzPlateview)
   this.WeblitzPlateview = new jQuery._WeblitzPlateview (this, options);
   });
};

jQuery.WeblitzPlateview = function (elm, options) {
  var container = jQuery(elm).get(0);
  if (container === undefined) return null;
    var rv = container.WeblitzPlateview || (container.WeblitzPlateview = new jQuery._WeblitzPlateview(container, options));
  return rv;
};

/* (make believe) Private constructor */

/**
 * _WeblitzPlateview class created in the jQuery namespace holds all logic for interfacing with the weblitz
 * plate and ajax server.
 */

jQuery._WeblitzPlateview = function (container, options) {
  var opts = jQuery.extend({
      baseurl: '',
      staticurl: '/static/webgateway/',
      width: 64,
      height: 48,
      useParentPrefix: true,
      thumbnailsBatch: 50,
      defaultThumb: ''
    }, options);

  // if options.size is set, it will be used below, otherwise thumbs will be default size
  this.self = jQuery(container);
  this.self.addClass('weblitz-plateview');
  this.origHTML = this.self.html();
  this.self.html("");
  var _this = this;
  var thisid = this.self.attr('id');
  var spacer_gif_src = opts.staticurl + 'img/spacer.gif';

  var _reset = function (result, data) {
    _this.self.html("");
    var thumbAspectRatio = 1;
    if (data.image_sizes && data.image_sizes.length > 0) {
      var sizes = data.image_sizes[0];
      thumbAspectRatio = (sizes.y / sizes.x);
    }
    $('<style id="wellstyle">.wellSize::before {padding-bottom: ' + (thumbAspectRatio * 100) + '%;}</style>').appendTo(_this.self);
    var table = $('<table></table>').appendTo(_this.self);
    table.addClass('showWellLabel wellSize' + opts.width);
    var thead = $('<thead></thead>').appendTo(table);
    var tr = $('<tr></tr>').appendTo(thead);
    tr.append('<th>&nbsp;</th>');
    for (var i=0; i<data.collabels.length; i++) {
      tr.append('<th>'+data.collabels[i]+'</th>');
    }

    var tbody = $('<tbody></tbody>').appendTo(table);
    var imgIds = [];
    var html = "";
    // Build table html and append below
    thumb_w = opts.width;

    for (i=0; i < data.rowlabels.length; i++) {
      html += '<tr>';
      html += '<th>'+data.rowlabels[i]+'</th>';
      for (var j=0; j<data.grid[i].length; j++) {
        if (data.grid[i][j] === null) {
          html += '<td class="placeholder"><div class="wellSize"><img src="' + spacer_gif_src + '" /></div></td>';
        } else {
          imgIds.push(data.grid[i][j].id);
          data.grid[i][j]._wellpos = data.rowlabels[i]+data.collabels[j];
          var parentPrefix = '';
          if (opts.useParentPrefix) {
              parentPrefix = thisid+'-';
          }
          html += '<td class="well" id="'+parentPrefix+'well-'+data.grid[i][j].wellId+'">' +
            '<div class="wellSize">' +
              '<img class="waiting" src="' + spacer_gif_src + '" />' +
              '<img id="' + parentPrefix + 'image-' + data.grid[i][j].id + '" class="loading" name="' + (data.rowlabels[i] + data.collabels[j]) + '">' +
            '</div>' +
            '<div class="wellLabel">' + data.rowlabels[i] + data.collabels[j] + '</div>' +
            '</td>';
        }
      }
      html += '</tr>';
    }
    tbody.append(html);

    _this.self.trigger('_gridLoaded');

    // Handle loading of images - NB: need to bind to each image since load events don't bubble
    $("img.loading", table).on("load", function(){
      $(this).removeClass('loading').siblings('.waiting').remove();
      _this.self.trigger('thumbLoad', [$(this).parent(), $(this)]);
    });


    // load thumbnails in a batches
    var load_thumbnails = function(input, batch) {
      if (input.length > 0 && batch > 0) {
        var iids = input.slice(0 , batch)
        if (iids.length > 0) {
          var thumbnails_url = opts.baseurl+'/get_thumbnails/';
          thumbnails_url += '?' + $.param( { id: iids }, true);
          var _load_thumbnails = function (result, data) {
            $.each(data, function(key, value) {
              if (value === null) {
                value = opts.defaultThumb;
              }
              $("img#"+parentPrefix+"image-"+key).attr("src", value);
            });
            if (input.length <= batch) {
              // last batch (NB: don't *know* that all previous batches have loaded)
              _this.self.trigger('_thumbsLoaded');
            }
          }
          gs_json(thumbnails_url, null, _load_thumbnails);
          load_thumbnails(input.slice(batch, input.length), batch);
        }
      }
    }

    thumbnailsBatch = parseInt(opts.thumbnailsBatch);
    load_thumbnails(imgIds, thumbnailsBatch);
    _this.self.trigger('_resetLoaded');
  };

  this.load = function (pid,field,acquisition) {
    $('table img', _this.self).remove();
    $('table div.placeholder', _this.self).removeClass('placeholder').addClass('loading');
    if (field === undefined) {
      field = 0;
    }

    var url = opts.baseurl+'/plate/'+pid+'/'+field+'/'
    if (acquisition) {
      url += acquisition+'/';
    }
    if (opts.size) {
      url += '?size='+opts.size;
    }
    gs_json(url, null, _reset);
  };

  this.setFocus = function (elm, evt) {
    if (!$(this).data('noFocus')) {
      $('img', elm.parents('table').eq(0)).removeClass('pv-focus');
      elm.addClass('pv-focus');
    }
  };

  this.rmFocus = function (elm) {
    if (elm) {
      elm.removeClass('pv-focus');
    } else {
      $('img', _this.self).removeClass('pv-focus');
    }
  };

  this.setSpwThumbSize = function(size) {
    // This sets width and height of all spw images (thumbnails and placeholders)
    // based on the aspect ratio;
    // if well is small, offset the hover label
    var cls = size < 30 ? 'wellLabelOffset ' : '';
    cls += 'wellSize' + size;
    $("#spw>table").prop('class', cls);
  };
};
