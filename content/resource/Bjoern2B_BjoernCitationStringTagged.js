{
    "translatorID": "b46d575e-396c-11ea-8ee0-0741699b71ec",
    "label": "Bjoerns Citation String with country, year in brackets (Bjoern2B)",
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
    "lastUpdated": "2021-05-01 19:31:30"
}


function doExport() {
	// Configure this:
	const ashtml = true;
	// The citations have a bracket around the year only:
	const year_in_brackets = true;
	// Include the item title (you probably want year_in_brackets = false)
	const show_title = false;
	// Append the Zotero locator
	const show_zotero_locator = false;
	// --------------------------------------------
	// Get the strings:
	const full_citation_string = getFullCitationString(ashtml, year_in_brackets, show_title, show_zotero_locator)
	Zotero.write(full_citation_string)
}


// Shared code

// legal types are weird
var LEGAL_TYPES = ["bill", "case", "gazette", "hearing", "patent", "regulation", "statute", "treaty"];
var Mem = function (item) {
	var lst = [];
	var isLegal = isLegal = (LEGAL_TYPES.indexOf(item.itemType) > -1);
	this.set = function (str, punc, slug) { if (!punc) { punc = "" }; if (str) { lst.push((str + punc)) } else if (!isLegal) { lst.push(slug) } };
	this.setlaw = function (str, punc) { if (!punc) { punc = "" }; if (str && isLegal) { lst.push(str + punc) } };
	this.get = function () { return lst.join(" ") };
}

function getFullCitationString(ashtml, year_in_brackets, show_title, show_zotero_locator) {
	var { strings, group_beginning, item_separator, group_end } = formatCitations(ashtml, year_in_brackets, show_title)
	strings.sort((a, b) => (a.key > b.key) ? 1 : ((b.key > a.key) ? -1 : 0))
	if (show_zotero_locator) {
		strings = strings.map(x => x.value + "; " + x.zotlocator)
	} else {
		strings = strings.map(x => x.value)
	}
	return group_beginning + strings.join(item_separator) + group_end
}

function formatCitations(ashtml, year_in_brackets, show_title) {
	var item_beginning = ""
	var item_middle = ""
	var before_date = ""
	var after_date = ""
	var item_end = ""
	var group_beginning = ""
	var group_end = ""
	var item_separator = "; "
	if (ashtml) {
		// Start/middle/end of citation markup
		item_beginning = "<a href=\""
		item_middle = "?openin=zoteroapp\">⇡"
		item_end = "</a>"
		// Start/middle/end of set of citations.	
		group_beginning = "("
		group_end = ")"
	} else {
		// Start/middle/end of citation markup
		item_beginning = "⟦"
		item_middle = "|"
		item_end = "⟧"
		// Start/middle/end of set of citations.
		group_beginning = "("
		group_end = ")"
	}
	if (year_in_brackets) {
		before_date = " ("
		after_date = ")"
		group_beginning = ""
		group_end = ""
		item_separator = ", "
	} else {
		before_date = ", "
	}
	var item
	var strings = []
	while (item = Zotero.nextItem()) {
		var { citationstring, citation, zoteroLocators } = formatOneCitation(item, before_date, after_date, ashtml, item_beginning, item_middle, item_end, show_title)
		if (!zoteroLocators) {
			zoteroLocators = " error with zotero locators ";
		}
		strings.push({ key: citationstring, value: citation, zotlocator: zoteroLocators })
	}
	return { strings, group_beginning, item_separator, group_end }
}

function formatOneCitation(item, before_date, after_date, ashtml, item_beginning, item_middle, item_end, show_title) {
	var citation = ""
	var mem = new Mem(item)
	var memdate = new Mem(item)
	// Zotero.write(beginning);
	var library_id = item.libraryID ? item.libraryID : 0
	var tagstring = ""
	// Construct citation_prefix from tags and year_letter
	var citation_prefix = ""
	var year_letter = ""
	if (item.tags.length > 0) {
		// There are tags.
		// tagstring += JSON.stringify(item.tags);
		var j = 0
		for (var i = 0; i < item.tags.length; i++) {
			var str = item.tags[i].tag
			if (str.substring(0, 2) == "C:") {
				if (j > 0) {
					tagstring += ", "
				};
				tagstring += str.substring(2)
				j++
			};
			if (str.substring(0, 4) == "_yl:") {
				year_letter += str.substring(4)
			};
		};
		if (j > 0) {
			// There were C: tags
			tagstring += ": "
			citation_prefix += tagstring
		};
	}
	// Put together creators
	if (item.creators.length > 0) {
		mem.set(item.creators[0].lastName, "")
		if (item.creators.length == 2) {
			mem.set("& " + item.creators[1].lastName, "")
		} else if (item.creators.length > 2) {
			mem.set("et al.", "")
		} else {
			// There was only one author
		}
	} else {
		mem.set(false, ",", "anon.")
	}
	mem.setlaw(item.authority, ",")
	mem.setlaw(item.volume)
	mem.setlaw(item.reporter)
	mem.setlaw(item.pages)
	memdate.setlaw(item.court, ",")
	var date = Zotero.Utilities.strToDate(item.date)
	var dateS = (date.year) ? date.year : item.date
	memdate.set(dateS, "", "no date")
	var m = item.uri.match(/http:\/\/zotero\.org\/(users|groups)\/([^\/]+)\/items\/(.+)/)
	var prefix = ""
	var lib = ""
	var key = ""
	if (m) {
		if (m[1] === "users") {
			prefix = "zu:"
			if (m[2] === "local") {
				lib = "0"
			} else {
				lib = m[2]
			}
		} else {
			prefix = "zg:"
			lib = m[2]
		}
	} else {
		prefix = "zu:"
		lib = "0"
	}

	// Zotero.write(prefix + lib + ":" + item.key + end);
	var itemidentifier = "";
	var citationstring = "" + mem.get() + before_date + memdate.get() + year_letter + after_date;
	if (ashtml) {
		itemidentifier = `https://ref.opendeved.net/g/${lib}/${item.key}/${citationstring}`
	} else {
		itemidentifier = prefix + lib + ":" + item.key
	}

	const item_title = show_title ? item.title + " " : "";
	citation += item_beginning + itemidentifier + item_middle + item_title  + citation_prefix + citationstring + item_end

	var zoteroLocators = "";
	const zoteroLocatorSep = "; "
	zoteroLocators += "Zotero app: " + " zotero://select/" + lib + "/items/" + item.key + zoteroLocatorSep;
	zoteroLocators += "Zotero web: " + item.uri + zoteroLocatorSep;
	// zotero://select/groups/2405685/items/5SRMZ3SD
	if (lib == "2405685") {
		zoteroLocators += "Evidence library: https://docs.edtechhub.org/lib/" + item.key + zoteroLocatorSep;
	};
	if (lib == "2129771") {
		zoteroLocators += "Evidence library: https://docs.opendeved.net/lib/" + item.key + zoteroLocatorSep;
	};

	return { citationstring, citation, zoteroLocators }
}

