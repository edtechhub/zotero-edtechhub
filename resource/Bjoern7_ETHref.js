{
        "translatorID": "ba5f8764-3966-11ea-9cd5-5b52329a4e4c",
	"label": "Bjoerns useful sharer for the EdTech Hub (Bjoern7_ETHref)",
	"creator": "Bjoern Hassler — based on work by original creators Scott Campbell, Avram Lyon, Nathan Schneider, Sebastian Karcher, Frank Bennett",
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
	"lastUpdated": "2018-12-12 15:21:30"
}

//[[Koutsouris, & Norwich, 2018||zotero://select/items/5_9L678WAL]]http://zotero.org/groups/2339240/items/9L678WAL[[zg:2339240:9L678WAL||./]]		
//  zotero://select/groups/2339240/items/9L678WAL

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
    beginning = "";
    middle = "; ";
    end = "; ";
    var item;
    while (item = Zotero.nextItem()) {
	try {
	    var citation = "";
	    var mem = new Mem(item);
	    var memdate = new Mem(item);
	    // Zotero.write(beginning);
	    var library_id = item.libraryID ? item.libraryID : 0;
	    var tagstring = "";
	    var qstring = "";
	    var rstring = "";
	    if ('creators' in item && item.creators.length >0){
		mem.set(item.creators[0].lastName,",");
		if (item.creators.length > 2) mem.set("et al.", ",");
		else if (item.creators.length == 2) mem.set("& " + item.creators[1].lastName, ",");
	    } else {
		mem.set(false, ",","anon.");
	    }
	    // mem.set(item.title,",","(no title)");
	    mem.setlaw(item.authority, ",");
	    mem.setlaw(item.volume);
	    mem.setlaw(item.reporter);
	    mem.setlaw(item.pages);
	    memdate.setlaw(item.court,",");
	    var date = Zotero.Utilities.strToDate(item.date);
	    var dateS = (date.year) ? date.year : item.date;
	    memdate.set(dateS,"","no date");
	    citation += beginning;
	    citation += "" + mem.get() + " (" + memdate.get() + "). " + item.title + ". " + middle;
	    var prefix;
	    var lib;
	    var key;
	    var m = item.uri.match(/http:\/\/zotero\.org\/(users|groups)\/([^\/]+)\/items\/(.+)/);
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
	    citation += "Zotero app: " + " zotero://select/" + lib + "/items/" + item.key + end;	   
	    citation += "browser: " + item.uri + end;
	    // zotero://select/groups/2405685/items/5SRMZ3SD
	    if (lib == "2405685") {
		citation += "ETH library: https://docs.edtechhub.org/lib/" + item.key + end;
	    };
	    // Zotero.write(prefix + lib + ":" + item.key + end);
/*
	    var itemidentifier = prefix + lib + ":" + item.key;
	    citation += beginning + itemidentifier + middle;
	    citation += rstring+"."+qstring+"/"+tagstring;
	    // citation += "" + mem.get() + " " + memdate.get();
	    citation += end;
	    if ('archiveLocation' in item) {
		if (item.archiveLocation) {
		    citation += "; archiveLocation: " + item.archiveLocation ;
		} else {
		    citation += " ";
		};
	    } else {
		citation += " ";
	    }
	    citation += " ";
	    if ('extra' in item) {
		if (item.extra) {
		    citation += "; extra: " + item.extra ;
		} else {
		};
	    } else {
	    }
*/
	    citation += "\n";
	    Zotero.write(citation);
	} catch (e) {
	    // Zotero.write("ERROR "+e.message);
	}
    }
}
