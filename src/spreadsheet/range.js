(function(f, define){
    define([ "../kendo.core", "../util/text-metrics" ], f);
})(function(){

(function(kendo) {
    if (kendo.support.browser.msie && kendo.support.browser.version < 9) {
        return;
    }

    var $ = kendo.jQuery;

    var UnionRef = kendo.spreadsheet.UnionRef;
    var CellRef = kendo.spreadsheet.CellRef;
    var RangeRef = kendo.spreadsheet.RangeRef;

    var styles = [
        "color", "fontFamily", "underline",
        "italic", "bold", "textAlign",
        "verticalAlign", "background"
    ];

    var borders = {
        borderTop: { complement: "borderBottom", direction: { top: -1, bottom: -1 } },
        borderLeft: { complement: "borderRight", direction: { left: -1, right: -1 } },
        borderRight: { complement: "borderLeft", direction: { left: 1, right: 1 }  },
        borderBottom: { complement: "borderTop", direction: { top: 1, bottom: 1 }  }
    };

    var Range = kendo.Class.extend({
        init: function(ref, sheet) {
            this._sheet = sheet;
            this._ref = ref;
        },

        clone: function() {
            return new Range(this._ref.clone(), this._sheet);
        },

        skipHiddenCells: function() {
            var refs = [];
            var self = this, sheet = self._sheet;
            var skipHiddenRows = sheet.isHiddenRow.bind(sheet);
            var skipHiddenCols = sheet.isHiddenColumn.bind(sheet);
            self._ref.forEach(function add(ref){
                if (ref instanceof UnionRef) {
                    ref.forEach(add);
                } else {
                    ref = self._normalize(ref.toRangeRef());
                    var tl = ref.topLeft, br = ref.bottomRight;
                    var rows = partition(tl.row, br.row, skipHiddenRows);
                    var cols = partition(tl.col, br.col, skipHiddenCols);
                    for (var i = 0; i < rows.length; ++i) {
                        for (var j = 0; j < cols.length; ++j) {
                            refs.push(new RangeRef(
                                new CellRef(rows[i].begin, cols[j].begin),
                                new CellRef(rows[i].end, cols[j].end)
                            ));
                        }
                    }
                }
            });
            return sheet.range(refs.length > 1 ? new UnionRef(refs) : refs[0]);
        },

        _normalize: function(ref) {
            return this._sheet._grid.normalize(ref);
        },

        _set: function(name, value, noTrigger) {
            var self = this;
            var sheet = self._sheet;
            self._ref.forEach(function(ref) {
                sheet._set(ref.toRangeRef(), name, value);
            });
            if (!noTrigger) {
                sheet.triggerChange({
                    recalc : name == "formula" || name == "value" || name == "validation",
                    value  : value,
                    ref    : self._ref
                });
            }
            return self;
        },

        _get: function(name) {
            return this._sheet._get(this._ref.toRangeRef(), name);
        },

        _property: function(name, value) {
            if (value === undefined) {
                return this._get(name);
            } else {
                return this._set(name, value);
            }
        },

        value: function(value) {
            if (value !== undefined) {
                // When value is set through the public API we must clear the
                // formula.  Don't trigger change (third parameter), it'll be
                // done when setting the value below
                this._set("formula", null, true);
            }
            return this._property("value", value);
        },

        resize: function(direction) {
            var ref = this._resizedRef(direction);
            return new Range(ref, this._sheet);
        },

        _resizedRef: function(direction) {
            return this._ref.map(function(ref) {
                return ref.toRangeRef().resize(direction);
            });
        },

        _border: function(property, value) {
            var result;
            var complement = borders[property].complement;
            var direction = borders[property].direction;
            var sheet = this._sheet;

            sheet.batch(function() {
                result = this._property(property, value);

                if (value !== undefined) {
                    this._resizedRef(direction).forEach(function(ref) {
                        if (ref !== kendo.spreadsheet.NULLREF) {
                            new Range(ref, sheet)._property(complement, null);
                        }
                    });
                }
            }.bind(this), {});

            return result;
        },

        _collapsedBorder: function(property) {
            var result = this._property(property);
            var complement = borders[property].complement;
            var direction = borders[property].direction;

            this._resizedRef(direction).forEach(function(ref) {
                if (!result && ref !== kendo.spreadsheet.NULLREF) {
                    var range = new Range(ref, this._sheet);
                    result = range._property(complement);
                }
            }.bind(this));

            return result;
        },

        borderTop: function(value) {
            return this._border("borderTop", value);
        },
        borderRight: function(value) {
            return this._border("borderRight", value);
        },
        borderBottom: function(value) {
            return this._border("borderBottom", value);
        },
        borderLeft: function(value) {
            return this._border("borderLeft", value);
        },

        collapsedBorderTop: function() {
            return this._collapsedBorder("borderTop");
        },
        collapsedBorderRight: function() {
            return this._collapsedBorder("borderRight");
        },
        collapsedBorderBottom: function() {
            return this._collapsedBorder("borderBottom");
        },
        collapsedBorderLeft: function() {
            return this._collapsedBorder("borderLeft");
        },

        input: function(value) {
            var existingFormat = this._get("format"), x;
            if (value !== undefined) {
                var tl = this._ref.toRangeRef().topLeft;
                x = kendo.spreadsheet.calc.parse(this._sheet.name(), tl.row, tl.col, value);
                this._sheet.batch(function() {
                    var formula = null;
                    if (x.type == "exp") {
                        formula = kendo.spreadsheet.calc.compile(x);
                    } else if (x.type == "date") {
                        this.format(x.format || toExcelFormat(kendo.culture().calendar.patterns.d));
                    } else if (x.type == "percent") {
                        this.format(x.value*100 == (x.value*100|0) ? "0%" : "0.00%");
                    } else if (x.format && !existingFormat) {
                        this.format(x.format);
                    }
                    this.formula(formula);
                    if (!formula) {
                        // value() will clear the formula.  Lucky for us,
                        // x.value is undefined so it actually won't, but let's
                        // be explicit and only set value if formula is not
                        // present.
                        this.value(x.value);
                    }
                }.bind(this), { recalc: true, value: value, ref: this._ref, editorChange: this._sheet.isInEditMode() });

                return this;
            } else {
                value = this._get("value");
                var formula = this._get("formula");
                var type = existingFormat && !formula && kendo.spreadsheet.formatting.type(value, existingFormat);

                if (formula) {
                    // it's a Formula object which stringifies to the
                    // formula as text (without the starting `=`).
                    value = "=" + formula;
                } else OUT: { // jshint ignore:line
                    if (existingFormat && typeof value == "number") {
                        // check if we could parse back the displayed value.
                        // https://github.com/telerik/kendo/issues/5335
                        var t1 = kendo.spreadsheet.formatting.text(value, existingFormat);
                        x = kendo.spreadsheet.calc.parse(null, null, null, t1); // it's not a formula so we don't need sheet/row/col
                        var t2 = kendo.spreadsheet.formatting.text(x.value, existingFormat);
                        if (t1 == t2) {
                            value = t1;
                            break OUT; // jshint ignore:line
                        }
                    }
                    if (type === "date") {
                        value = kendo.toString(kendo.spreadsheet.numberToDate(value), kendo.culture().calendar.patterns.d);
                    } else if (type === "percent") {
                        value = (value * 100) + "%";
                    } else if (typeof value == "string" &&
                               (/^[=']/.test(value) ||
                                (/^(?:true|false)$/i).test(value) ||
                                looksLikeANumber(value))) {
                        value = "'" + value;
                    }
                }

                return value;
            }
        },

        enable: function(value) {
            if (value === undefined) {
                value = true;

                this._sheet.forEach(this._ref.toRangeRef(), function(_, __, data) {
                    if (data.enable === false) {
                        value = false;
                    }
                });

                return value;
            }

            this._property("enable", value);
        },

        format: function(value) {
            return this._property("format", value);
        },

        formula: function(value) {
            if (value === undefined) {
                var f = this._get("formula");
                return f ? "" + f : null; // stringify if present
            }
            return this._property("formula", value);
        },

        validation: function(value) {
            //TODO: Accept objects only?

            if (value === undefined) {
                var f = this._get("validation");

                return f ? f.toJSON() : null; // stringify if present
            }
            return this._property("validation", value);
        },

        _getValidationState: function() {
            var ref = this._ref.toRangeRef();
            var topLeftRow = ref.topLeft.row;
            var topLeftCol = ref.topLeft.col;
            var bottomRightRow = ref.bottomRight.row;
            var bottomRightCol = ref.bottomRight.col;
            var ci, ri;

            for (ci = topLeftCol; ci <= bottomRightCol; ci ++) {
                for (ri = topLeftRow; ri <= bottomRightRow; ri ++) {
                    var validation = this._sheet._validation(ri, ci);

                    if (validation && validation.type === "reject" && validation.value === false) {
                        return validation;
                    }
                }
            }

            return false;
        },

        merge: function() {
            this._ref = this._sheet._merge(this._ref);
            return this;
        },

        unmerge: function() {
            var mergedCells = this._sheet._mergedCells;

            this._ref.forEach(function(ref) {
                ref.toRangeRef().intersecting(mergedCells).forEach(function(mergedRef) {
                    mergedCells.splice(mergedCells.indexOf(mergedRef), 1);
                });
            });

            this._sheet.triggerChange({});

            return this;
        },

        select: function() {
            this._sheet.select(this._ref);

            return this;
        },

        values: function(values) {
            if (this._ref instanceof UnionRef) {
                throw new Error("Unsupported for multiple ranges.");
            }

            if (this._ref === kendo.spreadsheet.NULLREF) {
                if (values !== undefined) {
                    throw new Error("Unsupported for NULLREF.");
                } else {
                    return [];
                }
            }

            var ref = this._ref.toRangeRef();
            var topLeftRow = ref.topLeft.row;
            var topLeftCol = ref.topLeft.col;
            var bottomRightRow = ref.bottomRight.row;
            var bottomRightCol = ref.bottomRight.col;
            var ci, ri;

            if (values === undefined) {
                values = new Array(ref.height());

                for (var vi = 0; vi < values.length; vi++) {
                    values[vi] = new Array(ref.width());
                }

                for (ci = topLeftCol; ci <= bottomRightCol; ci ++) {
                    for (ri = topLeftRow; ri <= bottomRightRow; ri ++) {
                        values[ri - topLeftRow][ci - topLeftCol] = this._sheet._value(ri, ci);
                    }
                }

                return values;
            } else {
                for (ci = topLeftCol; ci <= bottomRightCol; ci ++) {
                    for (ri = topLeftRow; ri <= bottomRightRow; ri ++) {
                        var row = values[ri - topLeftRow];

                        if (row) {
                            var value = row[ci - topLeftCol];

                            if (value !== undefined) {
                                this._sheet._value(ri, ci, value);
                            }
                        }
                    }
                }

                this._sheet.triggerChange({ recalc: true });

                return this;
            }
        },

        _properties: function(props) {
            if (this._ref instanceof UnionRef) {
                throw new Error("Unsupported for multiple ranges.");
            }

            if (this._ref === kendo.spreadsheet.NULLREF) {
                if (props !== undefined) {
                    throw new Error("Unsupported for NULLREF.");
                } else {
                    return [];
                }
            }

            var ref = this._ref.toRangeRef();
            var topLeftRow = ref.topLeft.row;
            var topLeftCol = ref.topLeft.col;
            var bottomRightRow = ref.bottomRight.row;
            var bottomRightCol = ref.bottomRight.col;
            var ci, ri;
            var sheet = this._sheet;

            if (props === undefined) {
                props = new Array(ref.height());
                sheet.forEach(ref, function(row, col, data){
                    row -= topLeftRow;
                    col -= topLeftCol;
                    var line = props[row] || (props[row] = []);
                    line[col] = data;
                });
                return props;
            }
            else {
                var data;
                ref = ref.clone();
                var setProp = function(propName) {
                    var propValue = data[propName];
                    ref.topLeft.row = ref.bottomRight.row = ri;
                    ref.topLeft.col = ref.bottomRight.col = ci;
                    sheet._set(ref, propName, propValue);
                };
                for (ci = topLeftCol; ci <= bottomRightCol; ci ++) {
                    for (ri = topLeftRow; ri <= bottomRightRow; ri ++) {
                        var row = props[ri - topLeftRow];
                        if (row) {
                            data = row[ci - topLeftCol];
                            if (data) {
                                Object.keys(data).forEach(setProp);
                            }
                        }
                    }
                }
                sheet.triggerChange({ recalc: true, ref: this._ref });
                return this;
            }
        },

        clear: function(options) {
            var clearAll = !options || !Object.keys(options).length;

            var sheet = this._sheet;

            var reason = {
                recalc: clearAll || (options && options.contentsOnly === true),
                ref: this._ref
            };

            sheet.batch(function() {

                if (reason.recalc) {
                    this.formula(null);
                }

                if (clearAll) {
                    this.validation(null);
                }

                if (clearAll || (options && options.formatOnly === true)) {
                    styles.forEach(function(x) {
                        this[x](null);
                    }.bind(this));
                    this.format(null);
                    this.unmerge();
                }

            }.bind(this), reason);

            return this;
        },

        clearContent: function() {
            return this.clear({ contentsOnly: true });
        },

        clearFormat: function() {
            return this.clear({ formatOnly: true });
        },

        isSortable: function() {
            return !(this._ref instanceof UnionRef || this._ref === kendo.spreadsheet.NULLREF);
        },

        sort: function(spec) {
            if (this._ref instanceof UnionRef) {
                throw new Error("Unsupported for multiple ranges.");
            }

            if (this._ref === kendo.spreadsheet.NULLREF) {
                throw new Error("Unsupported for NULLREF.");
            }

            if (spec === undefined) {
                spec = { column: 0 };
            }

            spec = spec instanceof Array ? spec : [spec];

            this._sheet._sortBy(this._ref.toRangeRef(), spec.map(function(spec, index) {
                if (typeof spec === "number") {
                    spec = { column: spec };
                }

                return {
                    index: spec.column === undefined ? index : spec.column,
                    ascending: spec.ascending === undefined ? true : spec.ascending
                };
            }));

            return this;
        },

        isFilterable: function() {
            return !(this._ref instanceof UnionRef);
        },

        filter: function(spec) {
            if (this._ref instanceof UnionRef) {
                throw new Error("Unsupported for multiple ranges.");
            }

            if (spec === false) {
                this.clearFilters();
            } else {
                spec = spec === true ? [] : spec instanceof Array ? spec : [spec];

                this._sheet._filterBy(this._ref.toRangeRef(), spec.map(function(spec, index) {
                   return {
                       index: spec.column === undefined ? index : spec.column,
                       filter: spec.filter
                   };
                }));
            }

            return this;
        },

        clearFilter: function(spec) {
            this._sheet.clearFilter(spec);
        },

        clearFilters: function() {
            var filter = this._sheet.filter();
            var spec = [];

            if (filter) {
                for (var i = 0; i < filter.columns.length; i++) {
                    spec.push(i);
                }

                this._sheet.batch(function() {
                    this.clearFilter(spec);
                    this._filter = null;
                }, { layout: true, filter: true });
            }
        },

        hasFilter: function() {
            var filter = this._sheet.filter();
            return !!filter;
        },

        leftColumn: function() {
            return new Range(this._ref.leftColumn(), this._sheet);
        },

        rightColumn: function() {
            return new Range(this._ref.rightColumn(), this._sheet);
        },

        topRow: function() {
            return new Range(this._ref.topRow(), this._sheet);
        },

        bottomRow: function() {
            return new Range(this._ref.bottomRow(), this._sheet);
        },

        column: function(column) {
            return new Range(this._ref.toColumn(column), this._sheet);
        },

        row: function(row) {
            return new Range(this._ref.toRow(row), this._sheet);
        },

        forEachRow: function(callback) {
            this._ref.forEachRow(function(ref) {
                callback(new Range(ref, this._sheet));
            }.bind(this));
        },

        forEachColumn: function(callback) {
            this._ref.forEachColumn(function(ref) {
                callback(new Range(ref, this._sheet));
            }.bind(this));
        },

        sheet: function() {
            return this._sheet;
        },

        topLeft: function() {
            return this._ref.toRangeRef().topLeft;
        },

        intersectingMerged: function() {
            var sheet = this._sheet;
            var mergedCells = [];

            sheet._mergedCells.forEach(function(ref) {
                if (ref.intersects(this._ref)) {
                    mergedCells.push(ref.toString());
                }
            }.bind(this));

            return mergedCells;
        },

        getState: function(propertyName) {
            var topLeft = this._ref.first();
            var state = {
                ref     : topLeft,
                data    : [],
                origRef : this._ref
            };
            var properties;
            if (!propertyName) {
                properties = kendo.spreadsheet.ALL_PROPERTIES;
                state.mergedCells = this.intersectingMerged();
            } else if (propertyName === "input") {
                properties = ["value", "formula"];
            } else if (propertyName === "border") {
                properties = ["borderLeft", "borderTop", "borderRight", "borderBottom"];
            } else {
                properties = [propertyName];
            }

            var data = state.data;
            this.forEachCell(function(row, col, cell) {
                var cellState = {};
                var dr = row - topLeft.row;
                var dc = col - topLeft.col;
                if (!data[dr]) {
                    data[dr] = [];
                }
                data[dr][dc] = cellState;

                properties.forEach(function(property) {
                    cellState[property] = cell[property] || null;
                });
            });

            return state;
        },

        setState: function(state, isPaste) {
            var sheet = this._sheet;
            var origin = this._ref.first();
            var rowDelta = state.ref.row - origin.row;
            var colDelta = state.ref.col - origin.col;

            sheet.batch(function() {
                if (state.mergedCells) {
                    this.unmerge();
                }

                var row = origin.row;
                state.data.forEach(function(data, dr){
                    if (isPaste && sheet.isHiddenRow(state.ref.row + dr)) {
                        return;
                    }
                    var col = origin.col;
                    data.forEach(function(cellState, dc){
                        if (isPaste && sheet.isHiddenColumn(state.ref.col + dc)) {
                            return;
                        }
                        var range = isPaste ? sheet.range(row, col)
                            : sheet.range(origin.row + dr, origin.col + dc);
                        if (range.enable()) {
                            for (var property in cellState) {
                                if (property != "value") {
                                    // make sure value comes last (after the loop),
                                    // because if we set value here and get get to
                                    // formula later and cellState.formula is null,
                                    // it'll clear the value.
                                    range._set(property, cellState[property]);
                                }
                            }
                            if (!cellState.formula) {
                                // only need to set the value if we don't have a
                                // formula.  Go through the lower level setter rather
                                // than range.value(...), because range.value will clear
                                // the formula!  chicken and egg issues.
                                range._set("value", cellState.value);
                            }
                        }
                        col++;
                    });
                    row++;
                });

                if (state.mergedCells) {
                    state.mergedCells.forEach(function(merged) {
                        merged = sheet._ref(merged).relative(rowDelta, colDelta, 3);
                        sheet.range(merged).merge();
                    }, this);
                }
            }.bind(this), { recalc: true });
        },

        _adjustRowHeight: function() {
            var sheet = this._sheet;
            var state = this.getState();
            var mergedCells = [];

            for (var i = 0; i < state.mergedCells.length; i++) {
                mergedCells.push(sheet.range(state.mergedCells[i]));
            }

            this.forEachRow(function(row) {
                //check the sheet boundries first
                if(row.topLeft().row >= row.sheet()._rows._count) {
                   return;
                }
                var maxHeight = row.sheet().rowHeight(row.topLeft().row);
                row.forEachCell(function(rowIndex, colIndex, cell) {
                    var cellRange = sheet.range(rowIndex, colIndex);
                    var totalWidth = 0;
                    for (var i = 0; i < mergedCells.length; i++) {
                        if (cellRange._ref.intersects(mergedCells[i]._ref)) {
                            totalWidth += cell.width;
                            break;
                        }
                    }
                    var width = Math.max(sheet.columnWidth(colIndex), totalWidth);
                    maxHeight = Math.max(maxHeight, kendo.spreadsheet.util.getTextHeight(cell.value, width, cell.fontSize, cell.wrap));
                });
                sheet.rowHeight(row.topLeft().row, Math.max(sheet.rowHeight(row.topLeft().row), maxHeight));
            });
        },

        forEachCell: function(callback) {
            this._ref.forEach(function(ref) {
                this._sheet.forEach(ref.toRangeRef(), callback.bind(this));
            }.bind(this));
        },

        hasValue: function() {
            var result = false;

            this.forEachCell(function(row, col, cell) {
                if (Object.keys(cell).length !== 0) {
                    result = true;
                }
            });

            return result;
        },

        wrap: function(flag) {
            if (flag === undefined) {
                return !!this._property("wrap");
            }

            this.forEachRow(function(range) {
                var maxHeight = range.sheet().rowHeight(range.topLeft().row);

                range.forEachCell(function(row, col, cell) {
                    var width = this._sheet.columnWidth(col);
                    if (cell.value !== null && cell.value !== undefined) {
                        maxHeight = Math.max(maxHeight, kendo.spreadsheet.util.getTextHeight(cell.value, width, cell.fontSize, true));
                    }
                });

                range.sheet().rowHeight(range.topLeft().row, maxHeight);
            }.bind(this));

            this._property("wrap", flag);

            return this;
        },

        fontSize: function(size) {
            if (size === undefined) {
                return this._property("fontSize");
            }

            this.forEachRow(function(range) {
                var maxHeight = range.sheet().rowHeight(range.topLeft().row);

                range.forEachCell(function(row, col, cell) {
                    var width = this._sheet.columnWidth(col);
                    if (cell.value !== null && cell.value !== undefined) {
                        maxHeight = Math.max(maxHeight, kendo.spreadsheet.util.getTextHeight(cell.value, width, size, cell.wrap));
                    }
                });

                range.sheet().rowHeight(range.topLeft().row, maxHeight);
            }.bind(this));

            this._property("fontSize", size);

            return this;
        },

        draw: function(options, callback) {
            this._sheet.draw(this, options, callback);
        }
    });

    function partition(begin, end, predicate) {
        while (begin <= end && predicate(begin)) {
            begin++;
        }
        if (begin > end) {
            return [];
        }
        for (var i = begin + 1; i <= end; ++i) {
            if (predicate(i)) {
                return [
                    { begin: begin, end: i - 1 }
                ].concat(partition(i + 1, end, predicate));
            }
        }
        return [{ begin: begin, end: end }];
    }

    // use $.each instead of forEach to work in oldIE
    $.each(styles, function(i, property) {
        Range.prototype[property] = function(value) {
            return this._property(property, value);
        };
    });

    function toExcelFormat(format) {
        return format.replace(/M/g, "m").replace(/'/g, '"').replace(/tt/, "am/pm");
    }

    function looksLikeANumber(str) {
        // XXX: could do with just a regexp instead of calling parse.
        return !(/^=/.test(str)) && (/number|percent/).test(kendo.spreadsheet.calc.parse(null, 0, 0, str).type);
    }

    var measureBox = $('<div style="position: absolute !important; top: -4000px !important; height: auto !important;' +
                        'padding: 1px !important; margin: 0 !important; border: 1px solid black !important;' +
                        'line-height: normal !important; visibility: hidden !important;' +
                        'white-space: pre-wrap !important; word-break: break-all !important;" />'
                     )[0];

    function getTextHeight(text, width, fontSize, wrap) {
        var styles = {
            "baselineMarkerSize" : 0,
            "width" : width + "px",
            "font-size" : (fontSize || 12) + "px",
            "word-break" : (wrap === true) ? "break-all" : "normal",
            "white-space" : (wrap === true) ? "pre-wrap" : "pre"
        };

        return kendo.util.measureText(text, styles, measureBox).height;
    }

    kendo.spreadsheet.util = { getTextHeight: getTextHeight };
    kendo.spreadsheet.Range = Range;
})(window.kendo);

}, typeof define == 'function' && define.amd ? define : function(a1, a2, a3){ (a3 || a2)(); });