{
	"translatorID": "4ec4a50b-e979-448f-af4c-e5b46d1a3b03",
	"label": "Bjoerns Citation String with country, all in brackets (Bjoern2A)",
	"creator": "Bjoern Hassler (adapted from scannable cite)",
	"target": "html",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"displayOptions": {
		"exportCharset": "UTF-8"
	},
	"inRepository": true,
	"translatorType": 2,
	"browserSupport": "",
	"lastUpdated": "2018-12-30 19:31:30"
}

// legal types are weird
var LEGAL_TYPES = ["bill", "case", "gazette", "hearing", "patent", "regulation", "statute", "treaty"];
var Mem = function (item) {
	var lst = [];
	var isLegal = isLegal = (LEGAL_TYPES.indexOf(item.itemType) > -1);
	this.set = function (str, punc, slug) { if (!punc) { punc = "" }; if (str) { lst.push((str + punc)) } else if (!isLegal) { lst.push(slug) } };
	this.setlaw = function (str, punc) { if (!punc) { punc = "" }; if (str && isLegal) { lst.push(str + punc) } };
	this.get = function () { return lst.join(" ") };
}

function doExport() {
	const ashtml = true;
	// The citations have a bracket around the whole citation:
	const year_in_brackets = false;
	var item_beginning = "";
	var item_middle = "";
	var before_date = "";
	var after_date = "";
	var item_end = "";
	var group_beginning = "";
	var group_end = "";
	var item_separator = "; ";
	if (ashtml) {
		// Start/middle/end of citation markup
		item_beginning = "<a href=\"";
		item_middle = "?openin=zoteroapp\">⇡";
		item_end = "</a>";
		// Start/middle/end of set of citations.	
		group_beginning = "(";
		group_end = ")";
	} else {
		// Start/middle/end of citation markup
		item_beginning = "⟦";
		item_middle = "|";
		item_end = "⟧";
		// Start/middle/end of set of citations.
		group_beginning = "(";
		group_end = ")";
	}
	if (year_in_brackets) {
		before_date = " (";
		after_date = ")";
		group_beginning = "";
		group_end = "";
		item_separator = ", ";
	} else {
		before_date = ", ";
	}
	var item;
	var strings = [];
	while (item = Zotero.nextItem()) {
		var citation = "";
		var citation_prefix = "";
		var mem = new Mem(item);
		var memdate = new Mem(item);
		// Zotero.write(beginning);
		var library_id = item.libraryID ? item.libraryID : 0;
		var tagstring = "";
		var year_letter = "";
		if (item.tags.length > 0) {
			// There are tags.
			// tagstring += JSON.stringify(item.tags);
			var j = 0;
			for (var i = 0; i < item.tags.length; i++) {
				var str = item.tags[i].tag;
				if (str.substring(0, 2) == "C:") {
					if (j > 0) {
						tagstring += ", ";
					};
					tagstring += str.substring(2);
					j++;
				};
				if (str.substring(0, 4) == "_yl:") {
					year_letter += str.substring(4);
				};
			};
			if (j > 0) {
				// There were C: tags
				tagstring += ": ";
				citation_prefix += tagstring;
			};
		}
		if (item.creators.length > 0) {
			mem.set(item.creators[0].lastName, "");
			if (item.creators.length == 2) {
				mem.set("& " + item.creators[1].lastName, "");
			} else if (item.creators.length > 2) {
				mem.set("et al.", "");
			} else {
				// There was only one author
			}
		} else {
			mem.set(false, ",", "anon.");
		}
		mem.setlaw(item.authority, ",");
		mem.setlaw(item.volume);
		mem.setlaw(item.reporter);
		mem.setlaw(item.pages);
		memdate.setlaw(item.court, ",");
		var date = Zotero.Utilities.strToDate(item.date);
		var dateS = (date.year) ? date.year : item.date;
		memdate.set(dateS, "", "no date");
		var m = item.uri.match(/http:\/\/zotero\.org\/(users|groups)\/([^\/]+)\/items\/(.+)/);
		var prefix;
		var lib;
		var key;
		if (m) {
			if (m[1] === "users") {
				prefix = "zu:";
				if (m[2] === "local") {
					lib = "0";
				} else {
					lib = m[2];
				}
			} else {
				prefix = "zg:";
				lib = m[2];
			}
		} else {
			prefix = "zu:";
			lib = "0";
		}
		// Zotero.write(prefix + lib + ":" + item.key + end);
		var itemidentifier = "";
		var citationstring = "" + mem.get() + before_date + memdate.get() + year_letter + after_date;
		if (ashtml) {
			itemidentifier = `https://ref.opendeved.net/zo/zg/${lib}/7/${item.key}/${citationstring}`;
		} else {
			itemidentifier = prefix + lib + ":" + item.key;
		}
		citation += item_beginning + itemidentifier + item_middle + citation_prefix + citationstring + item_end;
		strings.push({ key: citationstring, value: citation });
	}
	strings.sort((a, b) => (a.key > b.key) ? 1 : ((b.key > a.key) ? -1 : 0))
	strings = strings.map(x => x.value)
	Zotero.write(group_beginning + strings.join(item_separator) + group_end);
}
