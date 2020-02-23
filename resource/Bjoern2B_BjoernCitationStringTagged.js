{
        "translatorID": "b46d575e-396c-11ea-8ee0-0741699b71ec",
	"label": "Bjoerns Citation String with country, year in brackets (Bjoern2B)",
	"creator": "Bjoern Hassler — original creators Scott Campbell, Avram Lyon, Nathan Schneider, Sebastian Karcher, Frank Bennett",
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
var LEGAL_TYPES = ["bill","case","gazette","hearing","patent","regulation","statute","treaty"];
var Mem = function (item) {
    var lst = [];
    var isLegal = isLegal = (LEGAL_TYPES.indexOf(item.itemType)>-1);
    this.set = function (str, punc, slug) { if (!punc) {punc=""}; if (str) {lst.push((str + punc))} else if (!isLegal) {lst.push(slug)}};
    this.setlaw = function (str, punc) { if (!punc) {punc=""}; if (str && isLegal) {lst.push(str + punc)}};
    this.get = function () { return lst.join(" ") };
}

function doExport() {
    var beginning = "{| ";
    var middle = "|||";
    var end = "}";
    beginning = "❲";
    middle = "|";
    end = "❳";
    beginning = "❲";
    middle = "|(";
    end = ")❳";
    var mmiddle = "";
    var bracketsOutside = false;
    var mmiddle = "";
    var allbeg = "(";
    var allend = ")";
    var allsep = "; ";
    if (bracketsOutside) {
	beginning = "⟦";
	middle = "|";
	end = "⟧";
    } else {
	beginning = "⟦";
	middle = "|";
	mmiddle = " (";
	end = ")⟧";
	allbeg = "";
	allend = "";
	allsep = ", ";
    };
    var item;
    var strings = [];
    while (item = Zotero.nextItem()) {
	var xbeginning = beginning;
	var xmiddle = middle;
	var xend = end;
	var citation = "";
        var mem = new Mem(item);
        var memdate = new Mem(item);
        // Zotero.write(beginning);
        var library_id = item.libraryID ? item.libraryID : 0;
	var tagstring = "";
        if (item.tags.length >0){
	    // There are tags.
	    // tagstring += JSON.stringify(item.tags);
	    var j=0;
	    for (var i=0; i<item.tags.length; i++) {
		var str = item.tags[i].tag;
		if (str.substring(0, 2) == "C:") {
		    if (j>0) {
			tagstring += ", ";
		    };
		    tagstring += str.substring(2);
		    j++;
		};
	    };
	    if (j>0) {
		// There were C: tags
		tagstring += ": ";
		xmiddle += tagstring;
	    };
	}
        if (item.creators.length >0){
            if (item.creators.length == 1) {
		if (bracketsOutside) {
		    mem.set(item.creators[0].lastName,",");
		} else {
		    mem.set(item.creators[0].lastName,"");
		};
	    } else if (item.creators.length > 2) {
		mem.set(item.creators[0].lastName,",");
		if (bracketsOutside) {
		    mem.set("et al.", ",");
		} else {
		    mem.set("et al.", "");
		};
	    } else if (item.creators.length == 2) {
		mem.set(item.creators[0].lastName,"");
		if (bracketsOutside) {
		    mem.set("& " + item.creators[1].lastName, ",");
		} else {
		    mem.set("& " + item.creators[1].lastName, "");
		};
	    }
        }
        else {
            mem.set(false, ",","anon.");
        }
        if (Zotero.getHiddenPref("ODFScan.includeTitle") || item.creators.length === 0) {
            mem.set(item.title,",","(no title)");
        }
        mem.setlaw(item.authority, ",");
        mem.setlaw(item.volume);
        mem.setlaw(item.reporter);
        mem.setlaw(item.pages);
        memdate.setlaw(item.court,",");
        var date = Zotero.Utilities.strToDate(item.date);
        var dateS = (date.year) ? date.year : item.date;
        memdate.set(dateS,"","no date");
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
	var itemidentifier = prefix + lib + ":" + item.key;
	citation += xbeginning + itemidentifier + xmiddle;
	citation += "" + mem.get() + " " + mmiddle + memdate.get();
	citation += xend;
	strings.push(citation);
    }
    Zotero.write(allbeg+strings.join(allsep)+allend);
}
