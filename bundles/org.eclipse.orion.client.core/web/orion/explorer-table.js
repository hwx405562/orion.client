/*******************************************************************************
 * @license
 * Copyright (c) 2009, 2011 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 * 
 * Contributors: IBM Corporation - initial API and implementation
 ******************************************************************************/

/*global define */
/*jslint regexp:false browser:true forin:true*/

define(['require', 'dojo', 'orion/util', 'orion/explorer', 'orion/breadcrumbs', 'orion/fileCommands', 'orion/contentTypes', 'dojo/number'],
		function(require, dojo, mUtil, mExplorer, mBreadcrumbs, mFileCommands){

	/**
	 * Tree model used by the FileExplorer
	 * TODO: Consolidate with eclipse.TreeModel.
	 */
	function Model(serviceRegistry, root, fileClient, treeId) {
		this.registry = serviceRegistry;
		this.root = root;
		this.fileClient = fileClient;
		this.treeId = treeId;
	}
	Model.prototype = new mExplorer.ExplorerModel(); 
	
	Model.prototype.getRoot = function(onItem){
		onItem(this.root);
	};
		
	Model.prototype.getChildren = function(/* dojo.data.Item */ parentItem, /* function(items) */ onComplete){
		// the parent already has the children fetched
		if (parentItem.children) {
			onComplete(parentItem.children);
		} else if (parentItem.Directory!==undefined && parentItem.Directory===false) {
			onComplete([]);
		} else if (parentItem.Location) {
			this.fileClient.fetchChildren(parentItem.ChildrenLocation).then( 
				dojo.hitch(this, function(children) {
					mUtil.processNavigatorParent(parentItem, children);
					onComplete(children);
				})
			);
		} else {
			onComplete([]);
		}
	};
	Model.prototype.constructor = Model;

	/**
	 * Renders json items into columns in the tree
	 */
	function FileRenderer (options, explorer, commandService, contentTypes) {
		this.explorer = explorer;
		this.commandService = commandService;
		this.contentTypes = contentTypes;
		this.openWithCommands = null;
		this._init(options);
	}
	FileRenderer.prototype = new mExplorer.SelectionRenderer(); 
	
	// we are really only using the header for a spacer at this point.
	FileRenderer.prototype.getCellHeaderElement = function(col_no){
		switch(col_no){
		case 0:
		case 1:
		case 2:
			return dojo.create("th", {style: "height: 8px;"});
		}
	};
		
	FileRenderer.prototype.getCellElement = function(col_no, item, tableRow){
		var self = this;
		function isImage(item) {
			var contentType = self.contentTypes.getContentType(item);
			switch (contentType && contentType.id) {
				case "image.jpeg":
				case "image.png":
				case "image.gif":
				case "image.ico":
				case "image.tiff":
				case "image.svg":
					return true;
			}
			return false;
		}

		switch(col_no){

		case 0:
			var col, span, link;
			if (item.Directory) {
				col = document.createElement('td');
				span = dojo.create("span", null, col, "only");
				// defined in ExplorerRenderer.  Sets up the expand/collapse behavior
					this.getExpandImage(tableRow, span);
				link = dojo.create("a", {className: "navlinkonpage", id: tableRow.id+"NameColumn", href: "#" + item.ChildrenLocation}, span, "last");
				dojo.place(document.createTextNode(item.Name), link, "last");
			} else {
				col = document.createElement('td');
				var i;
				
				// Images: always generate link to file. Non-images: use the "open with" href if one matches,
				// otherwise use default editor.
				if (!this.openWithCommands) {
					this.openWithCommands = mFileCommands.getOpenWithCommands(this.commandService);
					for (i=0; i < this.openWithCommands.length; i++) {
						if (this.openWithCommands[i].isEditor === "default") {
							this.defaultEditor = this.openWithCommands[i];
						}
					}
				}
				var href = item.Location, foundEditor = false;
				for (i=0; i < this.openWithCommands.length; i++) {
					var openWithCommand = this.openWithCommands[i];
					if (openWithCommand.visibleWhen(item)) {
						href = openWithCommand.hrefCallback({items: item});
						foundEditor = true;
						break; // use the first one
					}
				}
				var itemIsImage = isImage(item);
				if (!foundEditor && this.defaultEditor && !itemIsImage) {
					href = this.defaultEditor.hrefCallback({items: item});
				}
				
				span = dojo.create("span", null, col, "only");
				
				// spacer where a folder would have expand node
				var spacer = dojo.create("span", null, span, "last");
				dojo.addClass(spacer, "imageSprite");
				dojo.addClass(spacer, "core-sprite-none");
					
				// link with file image and name
				link = dojo.create("a", {className: "navlink", id: tableRow.id+"NameColumn", href: href}, span, "last");
				// If the file is an image, show a thumbnail next to the name.
				if (itemIsImage) {
					var thumbnail = dojo.create("img", {src: item.Location}, link, "last");
					dojo.addClass(thumbnail, "thumbnail");
				} else {
					var fileIcon = dojo.create("span", null, link, "last");
					dojo.addClass(fileIcon, "core-sprite-file_model");
				}
				dojo.place(document.createTextNode(item.Name), link, "last");
			}
			this.explorer.registry.getService("orion.page.command").renderCommands(span, "object", item, this.explorer, "tool", false, null, "commandActiveItem", "commandInactiveItem");
			return col;
		case 1:
			var dateColumn = document.createElement('td');
			if (item.LocalTimeStamp) {
				var fileDate = new Date(item.LocalTimeStamp);
				dateColumn.innerHTML = dojo.date.locale.format(fileDate);
			}

			return dateColumn;
		case 2:
			var sizeColumn = document.createElement('td');
			if (!item.Directory && typeof item.Length === "number") {
				var length = parseInt(item.Length, 10),
					kb = length / 1024;
				sizeColumn.innerHTML = dojo.number.format(Math.ceil(kb)) + " KB";
			}
			dojo.style(sizeColumn, "textAlign", "right");
			return sizeColumn;
		}
	};
	FileRenderer.prototype.constructor = FileRenderer;

	/**
	 * Creates a new file explorer.
	 * @name orion.explorer-table.FileExplorer
	 * @class A user interface component that displays a table-oriented file explorer
	 * @param {orion.serviceRegistry.ServiceRegistry} options.serviceRegistry
	 * @param {Object} options.treeRoot
	 * @param {orion.selection.Selection} options.selection
	 * @param {orion.searchClient.Searcher} options.searcher
	 * @param {orion.fileClient.FileClient} options.fileClient
	 * @param {orion.commands.CommandService} options.commandService
	 * @param {orion.file.ContentTypes} options.contentTypes
	 * @param {String} options.parentId
	 * @param {String} options.breadcrumbId
	 * @param {String} options.toolbarId
	 * @param {String} options.selectionToolsId
	 */
	function FileExplorer(options) {
		this.registry = options.serviceRegistry;
		this.treeRoot = options.treeRoot;
		this.selection = options.selection;
		this.searcher = options.searcher;
		this.fileClient = options.fileClient;
		this.commandService = options.commandService;
		this.contentTypes = options.contentTypes;
		this.parentId = options.parentId;
		this.breadcrumbId = options.breadcrumbId;
		this.toolbarId = options.toolbarId;
		this.selectionToolsId = options.selectionToolsId;
		this.model = null;
		this.myTree = null;
		this.renderer = new FileRenderer({checkbox: true, cachePrefix: "Navigator"}, this, this.commandService, this.contentTypes);
	}
	
	FileExplorer.prototype = new mExplorer.Explorer();
	
	// we have changed an item on the server at the specified parent node
	FileExplorer.prototype.changedItem = function(parent) {
		var self = this;
		this.fileClient.fetchChildren(parent.ChildrenLocation).then(function(children) {
			mUtil.processNavigatorParent(parent, children);
			dojo.hitch(self.myTree, self.myTree.refreshAndExpand)(parent, children, self.renderer.expandCollapseImageId(self.model.getId(parent)), self.renderer._expandImageClass, self.renderer._collapseImageClass);
		});
	};
		
	FileExplorer.prototype.getNameNode = function(item) {
		var rowId = this.model.getId(item);
		if (rowId) {
			// I know this from my renderer below.
			return dojo.byId(rowId+"NameColumn");
		}
	};
		
	/**
	 * Load the resource at the given path.
	 * @param path The path of the resource to load
	 * @param [force] If true, force reload even if the path is unchanged. Useful
	 * when the client knows the resource underlying the current path has changed.
	 */
	FileExplorer.prototype.loadResourceList = function(path, force) {
		// console.log("loadResourceList old " + this._lastHash + " new " + path);
		path = mUtil.makeRelative(path);
		if (!force && path === this._lastHash) {
			return;
		}
					
		this._lastHash = path;
		var parent = dojo.byId(this.parentId);			

		// we are refetching everything so clean up the root
		this.treeRoot = {};

		if (force || (path !== this.treeRoot.Path)) {
			//the tree root object has changed so we need to load the new one
			
			// Progress indicator
			var progress = dojo.byId("progress"); 
			if(!progress){
				progress = dojo.create("div", {id: "progress"}, parent, "only");
			}
			dojo.empty(progress);
			
			var progressTimeout = setTimeout(function() {
				dojo.empty(progress);
				var b = dojo.create("b");
				dojo.place(document.createTextNode("Loading "), progress, "last");
				dojo.place(document.createTextNode(path), b, "last");
				dojo.place(b, progress, "last");
				dojo.place(document.createTextNode("..."), progress, "last");
			}, 500); // wait 500ms before displaying
				
			this.treeRoot.Path = path;
			var self = this;
			
			this.fileClient.loadWorkspace(path).then(
				//do we really need hitch - could just refer to self rather than this
				dojo.hitch(self, function(loadedWorkspace) {
					clearTimeout(progressTimeout);
					//copy fields of resulting object into the tree root
					for (var i in loadedWorkspace) {
						this.treeRoot[i] = loadedWorkspace[i];
					}
					mUtil.rememberSuccessfulTraversal(this.treeRoot, this.registry);
					mUtil.processNavigatorParent(this.treeRoot, loadedWorkspace.Children);	
					//If current location is not the root, set the search location in the searcher
					this.searcher.setLocationByMetaData(this.treeRoot);
					// erase any old page title
					var breadcrumb = dojo.byId(this.breadcrumbId);
					if (breadcrumb) {
						dojo.empty(breadcrumb);
						new mBreadcrumbs.BreadCrumbs({
							container: breadcrumb, 
							resource: this.treeRoot,
							firstSegmentName: "root"
						});
					}
					mFileCommands.updateNavTools(this.registry, this, this.toolbarId, this.selectionToolsId, this.treeRoot);
					this.model = new Model(this.registry, this.treeRoot, this.fileClient);
					this.createTree(this.parentId, this.model);
					this.onchange && this.onchange(this.treeRoot);
				}),
				dojo.hitch(self, function(error) {
					clearTimeout(progressTimeout);
					// Show an error message when a problem happens during getting the workspace
					if (error.status !== null && error.status !== 401){
						dojo.place(document.createTextNode("Sorry, an error occurred: " + error.message), progress, "only");
					}
				})
			);
		}
	};
	/**
	 * Clients can connect to this function to receive notification when the root item changes.
	 * @param {Object} item
	 */
	FileExplorer.prototype.onchange = function(item) {
	};
	FileExplorer.prototype.constructor = FileExplorer;

	//return module exports
	return {
		FileExplorer: FileExplorer
	};
});
