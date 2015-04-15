define([
  "backbone",
  "underscore",
  "jquery",
  "datatables",
  "handlebars",
  "UnravelAgent",
  "text!templates/view.html"
], function (Backbone, _, $, datatables, Handlebars, UnravelAgent, viewTemplate) {
  return Backbone.View.extend({
    template: Handlebars.compile(viewTemplate),

    events: {
      "click #record": "record",
      "click #reset": "reset",
      "click #reduce": "reduceTable",
      "click .inspectElement": "inspectElement",
      "click .inspectSource": "inspectSource",
      "click #resultToggle": "toggleLibResultsPane",
      "click #detectJSAgain": "detectJSLibs",
      "click #filterSVG": "toggleFilterSVG",
      "click #constrain": "toggleConstrain"
    },

    currentPath: "",

    elementMap: {},

    dataTable: null,

    pathsDomRows: [],

    pathsJSRows: [],

    filterSVG: true,

    constrainToPath: false,

    initialize: function (options) {
      this.detectJSLibs();
    },

    render: function () {
      this.$el.html(this.template());
      this.domDataTable = this.$("table#domResults").DataTable({
        paging: false,
        searching: false,
        "order": [[ 0, "desc" ]]
      });
      this.jsDataTable = this.$("table#jsResults").DataTable({
        paging: false,
        searching: false,
        "order": [[ 0, "desc" ]]
      });
      if (mockData) {
        this.handleMutations(mockData);
      }
    },

    toggleFilterSVG: function () {
      if (this.$('#filterSVG').prop('checked')) {
        this.filterSVG = true;
      } else {
        this.filterSVG = false;
      }
    },

    toggleConstrain: function () {
      if (this.$('#constrain').prop('checked')) {
        this.constrainToPath = true;
      } else {
        this.constrainToPath = false;
      }

      this.stop();
      this.start();
    },

    record: function () {
      if (this.$("#record .active").is(":visible")) {
        this.stop();
      } else {
        this.start();
      }
    },

    start: function () {
      var callback = function () {
        this.$("#record .inactive").hide();
        this.$("#record .active").show();
      };

      var path = this.constrainToPath ? this.currentPath : "";

      UnravelAgent.runInPage(function (path) {
        return unravelAgent.startObserving(path);
      }, callback, path);

      UnravelAgent.runInPage(function () {
        unravelAgent.traceJsOn();
      });
    },

    stop: function () {
      var callback = function () {
        this.$("#record .active").hide();
        this.$("#record .inactive").show();
      };

      UnravelAgent.runInPage(function () {
        unravelAgent.stopObserving();
        unravelAgent.traceJsOff();
      }, callback);
    },

    reset: function () {
      this.domDataTable.row().remove().draw(false);
      this.jsDataTable.row().remove().draw(false);
      this.pathsDomRows = [];
      this.pathsJSRows = [];
      this.stop();
    },

    resetInspectedElement: function () {
      this.currentPath = "";
      this.$(".selectedWrap").hide();
    },

    elementSelected: function (cssPath) {
      if (this.currentPath != cssPath) {
        this.currentPath = cssPath;
      }
      this.$("#selectedElement").attr("data-path", cssPath);
      this.$("#selectedElement").html(cssPath + " <i class='glyphicon glyphicon-search'></i>");
      this.$(".selectedWrap").show();

      if (this.$("#record .active").is(":visible")) {
        this.stop();
        this.start();
      }
    },

    parseSelector: function (htmlString) {
      var $el = $(htmlString);

      if (!$el.prop || !$el.prop("tagName")) {
        return "";
      }

      var tagName = $el.prop("tagName").toLowerCase();
      var idName = $el.attr("id") || "";
      if (idName.length > 0) {
        idName = "#" + idName;
      }
      var nameAttr = $el.attr("name") || "";
      if (nameAttr.length > 0) {
        nameAttr = '[name="' + nameAttr + '"]';
      }

      var className;
      try {
        className = "." + $el.attr("class").split(" ").join(".");
      } catch (err) {
        className = "";
      }

      return tagName + idName + className + nameAttr;
    },

    handleMutations: function (mutations) {
      _(mutations).map(function (mutation) {
        mutation.selector = this.parseSelector(mutation.target);
        var path = (mutation.path || "");

        if (this.filterSVG && mutation.path.toLowerCase().indexOf("svg") > -1) {
          return;
        }

        var oldAttributeValue = mutation.attributeName ? "<span>" + (mutation.attributeName || '') + "=" + "'" + (mutation.oldValue || '') + "'</span></br>" : "";
        if (this.pathsDomRows[path]) {
          var data = this.pathsDomRows[path].data();
          data[0] = data[0] + 1;
          data[3] = "<div class='inlay'>" + $(data[3]).html() + oldAttributeValue + "</div>";
          this.pathsDomRows[path].data(data);
        } else {
          var trimmedPath = mutation.path;
          if (trimmedPath && trimmedPath.length > 45){
              trimmedPath = trimmedPath.substring(0, 45) + "...";
          }

          var dt = this.domDataTable.row.add([
            1,
            "<a href='#' title='Inspect Element' class='inspectElement' data-path='" + mutation.path + "'>" + trimmedPath + " <i class='glyphicon glyphicon-search'></i></a>",
            mutation.selector,
            "<div class='inlay'>" + oldAttributeValue + "</div>"
          ]);
          this.pathsDomRows[path] = dt.row(dt.index());
        }
      }, this);
      this.domDataTable.draw()
    },

    handleJSTrace: function (traceEvent) {
      var callStack = this.parseError(traceEvent.stack);

      var formattedArgs = traceEvent.args.replace("[", "");
      formattedArgs = formattedArgs.replace("]", "");
      var domCall = "document." + traceEvent.functionName + "(" + formattedArgs + ")<br/>";
      var formattedTrace = "";
      callStack = _(callStack).reverse();
      _(callStack).each(function (frame) {
        var cleanedScriptName = frame.script.replace("http://54.175.112.172","");
        var sourceUrl = "<a href='#' title='Inspect Element' class='inspectSource' data-path='" + frame.script + "|||" + frame.lineNumber + "'>" + (cleanedScriptName || 'none') + ":" + (frame.lineNumber || "none") + ":" + (frame.charNumber || "none") + "</a>";
        formattedTrace += sourceUrl + " (" + frame.functionName + ")<br/>";
      });

      var path = formattedTrace;

      if (this.pathsJSRows[path]) {
        var data = this.pathsJSRows[path].data();
        data[0] = data[0] + 1;
        this.pathsJSRows[path].data(data);
      } else {
        var dt = this.jsDataTable.row.add([
          1,
          formattedTrace,
          domCall
        ]);
        this.pathsJSRows[path] = dt.row(dt.index());
      }
      this.jsDataTable.draw()
    },

    parseError: function (error) {
      var frames = error.split('|||').slice(1).map(function (line) {
        if(line.indexOf("yimg.com") > -1){
          return "remove";
        }
        var tokens = line.replace(/^\s+/, '').split(/\s+/).slice(1);

        if (tokens[1] === "function)") {
          tokens[0] = tokens[0] + " " + tokens[1] + " " + tokens[2] + " " + tokens[3];
          tokens[1] = tokens[4];
          tokens = tokens.slice(0, 2);
        }

        var urlLike = tokens.pop().replace(/[\(\)\s]/g, '');
        var locationParts = urlLike.split(':');
        var lastNumber = locationParts.pop();
        var possibleNumber = locationParts[locationParts.length - 1];
        if (!isNaN(parseFloat(possibleNumber)) && isFinite(possibleNumber)) {
          var lineNumber = locationParts.pop();
          locationParts = [locationParts.join(':'), lineNumber, lastNumber];
        } else {
          locationParts = [locationParts.join(':'), lastNumber, undefined];
        }

        tokens[0] = tokens[0].replace("<anonymous>", "&lt;anonymous&gt;");
        locationParts[0] = locationParts[0].replace("<anonymous>", "&lt;anonymous&gt;");

        var functionName = (!tokens[0] || tokens[0] === 'Anonymous') ? undefined : tokens[0];

        if (functionName.indexOf("unravelAgent") > -1) {
          return "remove";
        }

        return {
          functionName: functionName,
          script: locationParts[0],
          lineNumber: locationParts[1],
          charNumber: locationParts[2]
        };
      }, this);

      return _(frames).without("remove");
    },

    inspectElement: function (e) {
      var path = $(e.target).attr("data-path");
      var doInspect = function (path) {
        if (!path) {
          console.log("No path provided when trying to inspect.");
          return;
        } else {
          console.log("Inspect " + unravelAgent.$(path)[0])
        }
        inspect(unravelAgent.$(path)[0]);
      };

      UnravelAgent.runInPage(doInspect, null, path);
    },

    inspectSource: function (e) {
      var path = $(e.target).attr("data-path");
      var arr = path.split("|||");
      var url = arr[0], lineNumber = arr[1], callback;

      //console.log("Unravel: Click to inspect (" + url + ":" + lineNumber + ")");
      chrome.devtools.panels.openResource(url, parseInt(lineNumber), function(){});
    },

    detectJSLibs: function () {
      var callback = function (arr, exception) {
        var $resultList = this.$("#libResults ul");
        $resultList.empty();
        var $message = $("<li>Detecting...</li>");
        $resultList.append($message);

        window.setTimeout(function () {
          $message.remove();
          if (arr.length < 1) {
            $resultList.append("<li>None Detected.</li>")
          } else {
            _(arr).each(function (o) {
              $resultList.append("<li>" + o.lib + ": " + o.value + "</li>")
            });
          }
        }, 1000);
      };

      UnravelAgent.runInPage(function () {
        return unravelAgent.libDetect();
      }, callback);
    }
  });
});




