
download file
Ext.define('Common.components.grid.EditableGrid', {
    extend: 'Common.components.grid.BaseGrid',
    xtype: 'coreeditablegrid',

    mixins: [
        'Common.mixins.Locale',
        'Common.mixins.DataServices'
    ],

    requires: [
        'Common.azure.RSAzure',
        'Common.components.grid.plugin.AddingBufferRow',
        'Common.components.grid.plugin.RowEditing',
        'Common.utils.File',
        'Ext.grid.filters.Filters',
        'Ext.grid.plugin.Exporter',
    ],

    viewModel: {
        data: {
            showClearSorters: false,
            hideFilters: false
        }
    },

    cls: 'rs-coreeditablegrid',

    btnsBaseCls: 'rs-coreeditablegrid-editor-buttons',

    editorReady: null, // Check if plugin editor is ready.

    lastSelectionByUser: null,

    initialSorters: null, // Store initial sorters from store

    /** @const */
    SORT_DESC: '&#xf175;',
    /** @const */
    SORT_ASC: '&#xf176;',

    config: {
        /**
         * True to enable initite scroll bar
         * @type {Boolean}
         */
        infiniteScrollEnabled: false,

        /**
         * True to enable local export
         * @type {Boolean}
         */
        localExport: false,

        /**
         * API Url of exporter
         * @type {String}
         */
        exportApi: '',
        exportZipApi: '',
        /**
         * Export file name
         * @type {String}
         */
        defaultFileName: 'dataexport',
        /**
         * Config used to activate row validation
         * @type {Boolean}
         */
        rowValidation: true,

        /**
         * The number of clicks to move the row editor to a new row while it is visible and actively editing another row.
         * @type {Number}
         */
        clicksToEdit: 2,

        /**
         * Row editing plugin, add to grid by default.
         * @type {Common.components.grid.plugin.RowEditing}
         */
        editingPlugin: null,

        /**
         * Hide editing form when clicking to a row.
         * This feature is activated when 'clicksToEdit' config is set to a number other than 1.
         * @type {Boolean}
         * @default true
         */
        hideEditOnBlur: true,

        /**
         * True to prevent error tooltip from showing when starting edit.
         * @type {Boolean}
         */
        preventTooltipOnStart: true,

        /**
         * The row editing plugin class to use
         * @type {string}
         */
        rowEditingPluginClass: 'Common.components.grid.plugin.RowEditing',

        /**
         * Toggles whether we want the clear sorter toolbar to appear or not
         * @type {Boolean}
         */
        showClearSorters: true,

        /**
         * True to enable prefetch of data when scrollbar reaches top
         * @type {Boolean}
         */
        loadOnScrollTop: false,

        /**
         * True to enable adding/inserting new records to bufferedstore
         * @type {Boolean}
         */
       addToBufferedStore: false
    },

    /**
     * Convenience config. Short for 'Bottom Bar'.
     * @type {Object}
     */
    dockedItems: {
        xtype: 'toolbar',
        dock: 'bottom',
        hidden: true,
        bind: {
            hidden: '{!showClearSorters || readOnly}'
        },
        items: [{
            xtype: 'button',
            itemId: 'clearAllSortersButton',
            iconCls: 'msg-clearsort',
            margin: '0 5 0 0',
            bind: {
                tooltip: '{clearSortersString}'
            }
        }, {
            xtype: 'label',
            itemId: 'sortLabelItemId',
            bind: {
                text: '{sortOrderString}'
            }
        }, {
            xtype: 'panel',
            itemId: 'sortOrderStringItemId',
            bind: {
                hidden: '{!sortOrder}'
            },
            padding: 2,
            width: '100%',
            style: {
                fontFamily: 'Font Awesome 5 Free'
            }
        }]
    },

    onAfterRender: function () {
        let me = this,
            clearAllSortersButton = me.down('#clearAllSortersButton'),
            store = me.getStore();

        me.callParent(arguments);

        if (clearAllSortersButton) {
            clearAllSortersButton.on('click', me.onClearSortersClick, this);
        }

        // For remotely sorted stores, event beforesort will be just before the load operation triggered by changing the store's sorters.
        // For locally sorted stores, event beforesort won't be called when initial grid with sorters config
        // So need to call onGridSortChange to trigger clear sorter button if the grid has initial sorters and use local sort
        !store.remoteSort && me.initialSorters.length && me.onGridSortChange();
    },

    /**
     * @override
     */
    bindStore: function() {
        let me = this;

        me.callParent(arguments);

        let store = me.getStore();

        // Fire 'dirtychange' event when there's any update on grid store.
        store.on('add', me.onStoreChange, me);
        store.on('remove', me.onStoreChange, me);
        store.on('update', me.onStoreChange, me);

        store.on('beforesort', me.onGridSortChange, me);

        // Store initial sorters
        me.initialSorters = store.getSorters().getRange();
    },

    onStoreChange: function() {
        let me = this,
            store = me.getStore(),
            modifiedRecords = store.getModifiedRecords();

        me.fireEvent('dirtychange', me, modifiedRecords);
    },

    /**
     * A safe way to load store when the editor is ready. Using this method to make sure that grid loads store after
     * editor's combobox enumerations are all loaded.
     */
    load: function() {
        let view = this;

        view.editorReady.then(function() {
            let store = view.getStore();

            if (!store || store.isEmptyStore) {
                view.fireEvent('gridstoreloaded');
            } else {
                store.load({
                    callback: function() {
                        view.fireEvent('gridstoreloaded');
                    }
                });
            }
        });
    },

    /**
     * Clear references and destroy component.
     */
    destroy: function() {
        let view = this;

        view.editorReady.destroy();

        if (view.editingPlugin && !view.editingPlugin.destroyed) {
            view.editingPlugin.destroy();
        }

        view.exporterPlugin = view.editorReady = view.editingPlugin = view.clicksToEdit = view.rowValidation = null;

        view.callParent(arguments);
    },

    /**
     * Add new row to grid.
     * @param {Ext.data.Model} record Model of the new row.
     */
    addNew: function(record) {
        let view = this,
            store = view.getStore();

        if (this.getCollapsed()) {
            this.setCollapsed(false);
        }

        store.insert(0, record);

        view.editingPlugin.onAddNew(record);
    },

    initComponent: function() {
        let view = this;

        view.editorReady = new Ext.Deferred();
        view.callParent(arguments);

        view.locale = Locale.basegrid_strings.strings;
        view.initLocale(view, Locale.basegrid_strings);
        view.afterInit();
    },

    disableSorting: function() {
        for (let column of this.getColumns()) {
            column.sortable = false;
        }
    },

    hideFilters: function() {
        this.getViewModel().set('hideFilters', true);
    },

    /**
     * Prepare features, event, layout and anything else affect to grid after initializing
     */
    afterInit: function() {
        let view = this;

        // Add row editing plugin for editable grid.
        view.addPlugins();
        view.addFeatures();
        view.addCustomEventHandler();
        view.updateActiveColumn();
        view.removeColumnIsLimit();
    },

    /**
     * Add plugins for grid.
     */
    addPlugins: function() {
        let view = this;

        // Add Eow Editing plugin
        // Add plugin if there's any column editor.
        // We don't need to add plugin if there's no editor.
        if (view.hasColumnEditor() && !view.editingPlugin) {
            view.setEditingPlugin(Ext.create(view.getRowEditingPluginClass(), {
                clicksToEdit: view.getClicksToEdit() || 2,
                rowValidation: view.getRowValidation(),
                hideEditOnBlur: view.getHideEditOnBlur(),
                focusColumnIndex: view.focusColumnIndex || 0,
                preventTooltipOnStart: view.preventTooltipOnStart
            }));

            view.addPlugin(view.editingPlugin);
        }
        if(view.getAddToBufferedStore()){
            let addToBufferPlugin = Ext.create('Common.components.grid.plugin.AddingBufferRow',{
                id:'addToBuffer'
            });
            view.addPlugin(addToBufferPlugin);
        }

    },

    /**
     * Check if the current grid has editor in columns.
     * @return {Boolean} return 'true' if there're any editors.
     */
    hasColumnEditor: function() {
        let columns = this.getColumns(),
            length = columns.length,
            currentCol;

        for (let i = 0; i < length; i++) {
            currentCol = columns[i];

            if (currentCol.editor || (Ext.isFunction(currentCol.getEditor) && currentCol.getEditor())) {
                return true;
            }
        }

        return false;
    },

    addFeatures: function() {
        let view = this;

        // Add Infinite Scroll feature
        if (view.infiniteScrollEnabled) {
            let scrollbar = view.getScrollable();

            // Load next page when user finishes scroll
            scrollbar.on('scrollend', 'loadNextPage', view);
            // Keep scrollbar position when reloading/refreshing
            if(view.loadOnScrollTop){
                view.getView().preserveScrollOnReload = false;
                view.getView().preserveScrollOnRefresh = false;
            } else {
                view.getView().preserveScrollOnReload = true;
                view.getView().preserveScrollOnRefresh = true;
            }
        }
    },

    /**
     * Next page when scroll to end
     * @param  {Ext.grid.TableScroller} scroller
     * @param  {Number} x
     * @param  {Number} y
     */
    loadNextPage: function(scroller, x, y) {
        let view = this,
            store = view.getStore(),
            prefetchZone = scroller.getMaxPosition().y;

        // if prefetchZone is 0, that means the scrollbar is not needed, so
        // we should not be trying to prefetch the next page
        if (prefetchZone > 0) {
            if (view.loadOnScrollTop) {
                if (y == 0) {
                    return store.prefetchNextPage();
                }
            } else if (y && y !== 0 && Math.ceil(y) >= prefetchZone) {
                if(view.getAddToBufferedStore()){
                    return view.getPlugin('addToBuffer').getBufferedDataSet().prefetchNextPage();

                } else {
                    return store.prefetchNextPage();
                }

            }
        }
    },

    addCustomEventHandler: function() {
        let view = this;

        // Load columns' fields and add class for editor.
        view.on('afterrender', view.initEditor, view, {single: true});
        // Add Sort order signal if grid supports multiple sort

        view.on('beforefilter', 'onBeforeRemoteOperation', view, { delegate: 'textfilterbox'});
        view.on('beforeexport', 'onBeforeRemoteOperation', view);
        view.on('beforecustomsort', 'onBeforeRemoteOperation', view, { delegate: 'gridcolumn'});
        view.on('beforeclearfilter', 'onBeforeRemoteOperation', view);
        view.on('beforeclearsort', 'onBeforeRemoteOperation', view);
        view.on('beforecolumnchange', 'onBeforeRemoteOperation', view);
        view.on('beforecheckchange', 'onBeforeCheckChange', view, {delegate: 'checkcolumn'});
        view.on('exportToClick', 'exportTo', view);
    },

    onBeforeRemoteOperation: function(comp, callBackFn) {
        return this.fireEvent('beforeremoteoperation', comp, callBackFn);
    },

    onBeforeCheckChange: function() {
        //do not allow toggling of checking in this view - should be done in the detail view
        return false;
    },

    /**
     * Add CSS class and load enumerations for editor.
     */
    initEditor: function() {
        let view = this,
            editorForm = view.editingPlugin && view.editingPlugin.getEditor();

        if (editorForm) {
            // Add CSS class for editor.
            view.addEditorCls(editorForm);

            // Load columns' store after fields' editors are loaded.
            view.loadColumnFieldsStores(editorForm);
        } else {
            view.editorReady.resolve();
        }
    },

    /**
     * Add CSS class for editor.
     * @param {Ext.grid.RowEditor} editor
     */
    addEditorCls: function(editorForm) {
        let buttons = editorForm.getFloatingButtons();

        // Add base CSS class for form buttons to hide.
        buttons.addCls(this.btnsBaseCls);
    },

    /**
     * Load fields columns stores for editor's fields.
     */
    loadColumnFieldsStores: function(editorForm) {
        let view = this,
            form = editorForm.getForm(),
            fields = form.getFields(),
            columnsDataReady = [],
            fieldStore;

        fields.each(function(field) {
            fieldStore = Ext.isFunction(field.getStore) && field.getStore();

            if (fieldStore && fieldStore.isEmptyStore && (this.enumerationCategory = field.enumerationCategory)) {
                this.fieldItemId = field.getItemId();

                // Load fields store.
                columnsDataReady.push(view.loadEnumerationsItem(this.enumerationCategory).then(

                    function(record) {
                        view.loadEnumerationStore(record, this.enumerationCategory, this.fieldItemId);
                    },
                    null, null, this
                ));
            }
        });

        // Make the grid's editor to load field stores first before loading any data.
        Ext.Promise.all(columnsDataReady).then(function() {
            view.editorReady.resolve();
        });
    },

    /**
     * Remove 'Active' column if user is not admin role
     */
    updateActiveColumn: function() {
        let view = this,
            columnManager = view.getColumnManager(),
            // Header container should be got from lockedGrid if the current grid is a locked one
            headerContainer = view.lockedGrid ? view.lockedGrid.getHeaderContainer() : view.getHeaderContainer(),
            activeColumn = columnManager.getHeaderByDataIndex('active');

        if (activeColumn) {
            // If user is not admin one, 'Active' column filter should be checked by default
            if (!Application.hasAdminPrivilege()) {
                headerContainer.remove(activeColumn);
            }
        }
    },

    /**
     * Remove the columns if user is Consulting/Referring.
     */
    removeColumnIsLimit: function() {
        let view = this,
            columnManager = view.getColumnManager(),
            // Header container should be got from lockedGrid if the current grid is a locked one
            headerContainer = view.lockedGrid ? view.lockedGrid.getHeaderContainer() : view.getHeaderContainer(),
            columns = columnManager && columnManager.columns;
        
        if (columns) {
            if (Application.hasLimitPrivilege && Application.hasLimitPrivilege()) {
                columns.forEach(column => {
                    if(column.isLimit === true) {
                        headerContainer.remove(column);
                    }
                });
            }
        }
    },

    /**
     * @override Override from 'UiUtilities'.
     */
    getDefaultRootView: function() {
        let view = this;

        if (view.editingPlugin) {
            return view.editingPlugin.getEditor();
        }

        return view;
    },

    /**
     * Update Multi-Sort signal at the bottom of the grid
     */
    onGridSortChange: function() {
        let view = this,
            viewModel = view.getViewModel(),
            store = view.getStore(),
            detail = view.getSortOrderString();

        // Only show clear sorters when obtain list of columns string want to display
        if (detail.length > 0) {
            // Update signal via view model
            viewModel.setData({
                sortOrder: detail.join(', '),
                showClearSorters: this.getShowClearSorters()
            });

            // Reset sufficient data before sorting
            store.sufficientData = false;
        }
    },

    getSortOrderString: function() {
        let view = this,
            store = view.getStore(),
            columnManager = view.columnManager,
            dockedItems = view.getDockedItems('toolbar'),
            sortOrderStringEl = dockedItems ? dockedItems[0].down('#sortOrderStringItemId') : view.down('#sortOrderStringItemId'),
            sortOrderItems = sortOrderStringEl.items && sortOrderStringEl.items.items,
            property, direction, column,
            detail = [];

        // Clear all sortOrderLabel in sorter
        sortOrderStringEl.removeAll();
        // Collect multi-sort data
        store.getSorters().each((sorter) => {
            property = sorter.getProperty();
            direction = sorter.getDirection();
            column = columnManager.getHeaderByDataIndex(property);

            // When change TimeZone or show Calendar (TimeZone will auto change), dataIndex will also be changed,
            // lead to not get column by property of sorter, replace it by getting propertyPrefix
            if(!column && (property.endsWith('UTC') || property.endsWith('Local')) && view.getStore().getProxy().dateTimeColumnChangingByTimeZone) {
                column = columnManager.getHeaderByDataIndex(property.endsWith('UTC') ? property.replace(new RegExp('UTC$'), '') : property.replace(new RegExp('Local$'), ''));
            }

            // With initial Sorters, column's name hasn't been binded yet.
            // As @viewModel of controller has linked with EditableGridView,
            // column's name will refer to @viewModel
            if (column) {
                let itemId = `${column.dataIndex}SortLabel`,
                    columnName = column.text,
                    labelSortEl = sortOrderStringEl.down(`#${itemId}`);


                if (!columnName.trim()) {
                    let bindingLink = _.get(column, 'config.bind.text'),
                        bindingLinkStr = bindingLink ? bindingLink.match(/\w+/g)[0] : '';

                    columnName = view.getViewModel().get(bindingLinkStr);
                }
                detail.push(`${columnName}`);

                // Insert orderstring label
                if (Ext.Object.isEmpty(labelSortEl)) {
                    labelSortEl = Ext.create('Ext.form.Label', {
                        itemId,
                        text: sortOrderItems.length ? `, ${columnName}` : columnName
                    });
                    sortOrderStringEl.add(labelSortEl);
                }

                // Add cls for display up/down arrow
                labelSortEl.removeCls(`msg-clearsort-content-${direction === 'ASC' ? 'DESC' : 'ASC'}`);
                labelSortEl.addCls(`msg-clearsort-content-${direction}`);
            }
        });

        return detail;
    },

    /**
     * Clear sort of grid
     * @return {Promise}
     */
    onClearSortersClick: function() {
        let view = this;

        if (view.fireEvent('beforeclearsort', view, view.clearSorters.bind(view))) {
            view.clearSorters();
        }
    },

    /**
     * @private
     */
    clearSorters: function() {
        let view = this,
            headerContainer = view.getHeaderContainer(),
            sortOrderStringEl = view.down('#sortOrderStringItemId'),
            store = view.getStore();

        // Clear sorters on store
        store.getSorters().clear();
        // Clear all sortOrderLabel in sorter
        sortOrderStringEl.removeAll();
        // Clear sort arrow on header
        headerContainer.setSortState();
        // Clear sortOrder and hide 'Clear Sorters' button
        view.getViewModel().setData({
            sortOrder: null,
            showClearSorters: false
        });

        // We should allow users to clear the initial sorter as it is just a suggestion
        //store.getSorters().add(view.initialSorters);

        // Reload grid
        if (store.remoteSort) {
            return view.promiseLoad().then(function () {
                view.fireEvent('afterclearsort');
            });
        } else {
            //Clearing the sort for a local store (non-remote) just leaves it in the same state, so it's not really cleared.
            //To achieve a "cleared sort" state without reloading data, we need to re-order the original data. 'id' should be sufficient
            //as id is "decremented" (<-1) as data is created and inserted into the grid
            store.suspendEvent('beforesort');
            store.sort('id', 'ASC');
            store.getSorters().clear();
            store.resumeEvent('beforesort');

            return Ext.Promise.resolve();
        }
    },

    /**
     * Load store based on given criteria
     * @return {Promise}
     */
    promiseLoad: function() {
        let view = this,
            store = view.getStore(),
            deferred = new Ext.Deferred();

        // Pass through if the store is regular store.
        if (!store.canLoad || store.canLoad()) {
            store.on('load', function (storeComp, data) {
                deferred.resolve(data);
            }, store, {single: true});

            store.load();
        } else {
            deferred.resolve();
        }

        return deferred.promise;
    },

    /**
     * Export grid data to XLSX, CSV, PDF
     * @param  {Ext.Button} exportButton
     */
    exportTo: function(exportButton) {
        debugger;
        let  exportCfg = exportButton.cfg,
             view = this;

        if (view.getLocalExport()) {
            if (this.completeEdit() && !this.isEditing()) {
                if (view.fireEvent('beforeexport', view, view.exportLocal.bind(view, exportCfg))) {
                    view.exportLocal(exportCfg);
                }
            }
        } else {
            if (view.fireEvent('beforeexport', view, view.export.bind(view, exportCfg))) {
                view.export(exportCfg);
            }
        }
    },

    exportLocal: function(exportCfg) {
        let view = this,
            exportType = exportCfg.type,
            cfg = {
                type: exportType,
                titleStyle: null,
                tableHeaderStyle: null,
                defaultStyle: null,
                title: view.getDefaultFileName(),
                ignoreTitle: true,
                fileName: view.getDefaultFileName() + '.' + exportType,
                titleRowHeight: null,
                headerRowHeight: null
            };

      //  view.saveDocumentAs(cfg);
    },

    export: function (exportCfg) {
        let deferred = new Ext.Deferred(),
            paramStr;

        Common.azure.RSAzure.renewToken().then((response) => {
            let view = this,
                exportType = exportCfg.type,
                exportUrl = view.getExportApi(),
                exportZipUrl = view.getExportZipApi();

            if (exportType === 'csv' && !Ext.isEmpty(exportUrl)) {
                let // Get filter
                    filtersCriteria = view.getFilterCriteria(),
                    // Get sorter
                    sortersCriteria = view.getSortCriteria(),
                    // Get column order
                    columnsOrder = view.getColumnOrder(),
                    paramStr;

                paramStr = view.createExportParString(exportType, response.accessToken, filtersCriteria, sortersCriteria, columnsOrder);

                let url = Ext.urlAppend(exportUrl, paramStr);
                this.downloadFile(url, view.getDefaultFileName());
                deferred.resolve();
            } else if (exportType === 'zip' && !Ext.isEmpty(exportZipUrl)) {
                let seleted = view.getSelection();
                if (seleted.length > 0) {
                    let studyId = [];

                    // Update studyId when selecting one or more studies
                    Ext.Array.each(seleted, function(record) {
                        studyId.push(record.get('uid'));
                    });

                    let exportUrl = exportZipUrl + studyId.toString();

                    paramStr = view.createExportParString(exportType, response.accessToken);

                    let url = Ext.urlAppend(exportUrl, paramStr);
                    this.downloadFile(url);
                    deferred.resolve();
                }
            } else {
                Application.setAlarm(view.locale.notSupportExporting);
                deferred.reject(view.locale.notSupportExporting);
            }
        });

        return deferred.promise;
    },

    createExportParString: function (exportType, token, filtersCriteria = null, sortersCriteria = null, columnsOrder = []) {
        let view = this,
        columns = view.getColumns(),
        elements = [],
        columnName = [],
        proxy = view.getStore().getProxy(),
        manualEscapeValue = /[']/g,
        header = Ext.Ajax.getDefaultHeaders(),
        sessionId = header && header.SessionID,
        // #6129 - The export file is different from Organization list
        // Added IsUAC flag to bypass UAC if necessary
        proxyHeaders = proxy && proxy.getHeaders(),
        isUAC = proxyHeaders && proxyHeaders.IsUAC != null ? proxyHeaders.IsUAC : true,
        exportCriteria, exportOption, params, queryParams, paramStr, column;
        
        for (let columnOrder of columnsOrder) {
            column = columns.find(el => el.exportFieldName == columnOrder.id || el.fieldName == columnOrder.id || el.dataIndex == columnOrder.id || el.prefixDateTime == columnOrder.id);
            // Get FHIR standard column
            column && !column.excludedFromExport && elements.push(columnOrder.id.toString());
            // Get column name order
            column && !column.excludedFromExport && columnName.push(columnOrder.display.toString());
        }

        exportCriteria = Ext.Object.merge({},
            filtersCriteria,
            sortersCriteria ? {_sort: sortersCriteria} : {},
            {_elements: elements}
        );
        exportOption = {
            fileType: exportType,
            columnName: columnName,
            fileName: view.getDefaultFileName(),
            token: token,
            sessionid: sessionId,
            isUAC: isUAC, // Added IsUAC flag to bypass UAC if necessary
            ContentType:''
        };
        if (exportType === 'csv') {
            exportCriteria['_elements'] = exportCriteria['_elements'].join(',');
            exportOption.columnName = exportOption.columnName.join(',');
            exportOption.ContentType = 'text/csv';
        }
        if (exportType === 'zip') {
            exportOption.ContentType = 'application/zip';
        }
        queryParams = proxy.getQueryParams();
        params = Ext.Object.merge({},
            queryParams,
            exportCriteria,
            exportOption
        );

        for (let property in params) {
            if (paramStr) {
                paramStr = paramStr + '&' + this.getSearchParamString(property, params[property]);
            } else {
                paramStr = this.getSearchParamString(property, params[property]);
            }
        }
        // encodeURIComponent can't escapse some value (i.e. - _ . ! ~ * ' ( )) but some columns
        // need this value so it should be escapsed by manually using rExp
        return paramStr.replace(manualEscapeValue, s => '%' + s.charCodeAt(0).toString(16));
    },

    /**
     * Return param string based on the key and value, this function support value string, value array
     * @param  {String} paramKey   key of the search param
     * @param  {String/Array} paramValue value of the search param
     * @return {String} String of search param
     */
    getSearchParamString: function (paramKey, paramValue) {
        let paramString = '';

        // If value of this key is an array (i.e Age Range)
        // Get each item of this array to build query
        if (Ext.isArray(paramValue)) {
            let paramValuelength = paramValue.length,
                params = [],
                i;

            for (i = 0; i < paramValuelength; i++) {
                params.push(paramKey + '=' + encodeURIComponent(paramValue[i]));
            }

            paramString = params.join('&');
        } else { // Otherwise, just build param string by its key and value
            paramString = paramKey + '=' + encodeURIComponent(paramValue);
        }

        return paramString;
    },

    downloadFile: function (url, fileName) {
        //<debug>
        console.log('download file:', url);
        //</debug>

        if (Ext.browser.is.IE) {
            window.open(url, '_blank');
        } else {
            //Creating new link node.
            var link = document.createElement('a');
            link.href = url;

            if (link.download !== undefined) {
                //Set HTML5 download attribute. This will prevent file from opening if supported.
                link.download = fileName || '';
            }

            // Force file download (whether supported by server).
            if (url.indexOf('?') === -1) {
                url += '?download';
            }

            window.open(url, '_blank');
        }

        return true;
    },

    /**
     * Determine if row editing is in progress or not
     * @return {Boolean}
     */
    isEditing: function() {
        let editingPlg = this.editingPlugin;

        return editingPlg ? editingPlg.editing : false;
    },

    cancelEdit: function() {
        let editingPlg = this.editingPlugin;

        if (editingPlg && editingPlg.editing) {
            editingPlg.cancelEdit();
        }
    },

    completeEdit: function() {
        let editingPlg = this.editingPlugin;

        if (editingPlg && editingPlg.editing) {
            return editingPlg.completeEdit();
        }

        return true;
    },

    /**
     * Get filter criteria based on fhir standard
     * @return {Object}
     */
    getFilterCriteria: function() {
        let filterPlugin = this.filterPlugin;

        return filterPlugin ? filterPlugin.getFilterCriteria() : {_filter: {}};
    },

    /**
     * Get sorter criteria based on fhir standard
     * @return {String}
     */
    getSortCriteria: function() {
        let store = this.getStore(),
            sorters = store.getSorters().getRange();

        return store.getProxy().encodeSorters(sorters);
    },

    /**
     * Get column order based on fhir standard
     * @return {Array[]}
     */
    getColumnOrder: function() {
        let view = this,
            proxy = view.getStore().getProxy(),
            fhirSearchParams = proxy.getFhirSearchParams(),
            columns = view.getVisibleColumnManager().getColumns(),
            columnOrder = [], id;

        // Remove the first column if the grid applies DnD (Drap and Drop) feature
        if (!Ext.isEmpty(view.dragDropPlugin) && Ext.isArray(columns)) {
            columns.shift();
        }
        for (let i = 0, column, dataIndex; (column = columns[i++]);) {
            dataIndex = column.dataIndex;
            id = column.isDateTimeColumn && column.prefixDateTime;
            dataIndex && columnOrder.push({
                // As the fhirSearchParams is an empty object when grid didn't support Filter feature,
                // so the Id should be dataIndex
                // Otherwise, If this column is configured fhirExportParam use this instead of fhirSortParam
                // because sorting and exporting parameters maybe different.
                // With datetime columns whose dataIndex can be changed base on timezone, should use prefixDateTime instead of dataIndex
                id: id || (fhirSearchParams[dataIndex] ? fhirSearchParams[dataIndex].fhirExportParam : dataIndex),
                display: column.exportTitle ? column.exportTitle : column.text
            });
        }

        return columnOrder;
    },

    /**
     * @override
     * When collapsing the grid while editing
     * then go to another browser tab and comeback,
     * the grid header will be lost (this is an error in level component).
     * To prevent this error, change its behavior: don't allow collapse when grid is in editing mode.
     */
    collapse: function() {
        if (this.isEditing()) {
            this.completeEdit();
            return;
        }

        this.callParent();
    },

    /**
     * Get store's sorter
     * @return {Array}
     */
    getColumnSorters: function () {
        let me = this,
            store = me.getStore(),
            sorters = store.getSorters().getRange();

        return Ext.Array.map(sorters, function (sorter) {
            return {
                property: sorter._property,
                direction: sorter._direction
            };
        });
    }

});


============================

device

/**
 * @class Worklist.view.organization.DicomProxyDetailViewController
 * @author Cuong Dang <cdang@ramsoft.com>
 */

Ext.define('Worklist.view.organization.DicomProxyDetailViewController', {

    extend: 'Ext.app.ViewController',

    alias: 'controller.dicomproxydetailviewcontroller',

    requires: [
        'Worklist.dicomproxy_strings',
        'Worklist.user.mixins.UserOrganizationMixins',
    ],

    mixins: [
        'Worklist.core.mixins.Services',
        'Worklist.core.mixins.DicomDeviceMixin',
        'Worklist.user.mixins.UserOrganizationMixins',
        'Worklist.core.mixins.EnumerationService'
    ],

    init: function (view) {
        let me = this;

        me.locale = Worklist.dicomproxy_strings;
        me.initLocale(view, me.locale);
        me.initDirtyChange('dicomproxydetail');
        me.onSaveModel(view);

        // Add listener to handle 'refreshview' event.
        view.on('refreshview', me.loadData, me);
        // Add listener to handle 'initView' event when back from close button.
        view.addListener('initView', me.initView, me);
        me.callParent(arguments);
        me.lookup('imagingOrgSearchComp').getConditionalParams = me.getImgOrgConditionalParam;
    },

    getImgOrgConditionalParam: function () {
        let params = {}, me = this;

        if (me.viewModel.get('model').get('managingOrganizationId') > -1) {
            params['managingorganization'] = me.viewModel.get('model').get('managingOrganizationId');
        }

        return params;
    },

    loadData: function() {
        let me = this,
            model = me.getModel(),
            id = model.get('id'),
            newModel = Ext.create('Common.model.core.DicomProxyModel', { id });

        newModel.load({
            callback: function(record, operation, success) {
                if (success) {
                    me.getViewModel().set('model', record);
                    me.setDirtyFlag(false);
                }
            }
        });
    },

    initView: function(parentViewModel, newRoleName, event) {
        let me = this,
            viewModel = me.getViewModel(),
            isReadOnly = !viewModel.get('privilege.canUpdateDevice') || viewModel.get('readOnly');

        parentViewModel && (me.parentView = parentViewModel.getView());
        event && (me.event = event);

        if (parentViewModel) {
            let organizationId = parentViewModel && parentViewModel.get('organizationModelId');
            // Backup 'organizationModelId' to check privilege view history for device when back from Mainaging Organization detail page
            viewModel.set('organizationModelId', organizationId);
           
        }
        
        me.checkPrivilege(null, viewModel);
		// Show bubble message for read only mode page
        me.showBubbleMessage(isReadOnly);
        // Load roles into role combobox for given organization
        parentViewModel && me.onLoadRoleEnumeration(parentViewModel);
    },

    onSaveModel: function(view) {
        let me = this,
            locale = Worklist.dicomproxy_strings.strings;

        view.on('SaveModel', function() {
            let model = view.getViewModel().get('model'),
                deferred = new Ext.Deferred,
                performSaving = (model) => {
                    if (!model.get('active')) {
                        // Show prompt before deactivating a dicom proxy
                        Ext.Msg.confirm(locale.confirmTitleMessage, locale.confirmMessage,
                            function(choice) {
                                if (choice === 'yes') {
                                    return me.saveView(view, locale.updateSuccessMessage, locale.updateFailureMessage);
                                }
                            }
                        );
                    } else {
                        return me.saveView(view, locale.updateSuccessMessage, locale.updateFailureMessage);
                    }
                };

            // Show alert if the change meets criteria properly
            me.changingAlert(model).then(() => {
                performSaving(model).then(() => {
                    deferred.resolve();
                });
            }, {})['catch'](() => {
                deferred.reject();
            });

            return deferred.promise;

        }, this);
    },

    /**
     * Show alert if the change meets criteria properly
     * @param  {Common.model.core.DicomProxyModel} model
     */
    changingAlert: function(model) {
        let deferred = new Ext.Deferred,
            imgOrgPreviousValue = model.previousValues.imagingOrganizationId,
            mngOrgPreviousValue = model.previousValues.managingOrganizationId;

        // Alert if Organization is changed
        if (!Ext.isEmpty(imgOrgPreviousValue) || !Ext.isEmpty(mngOrgPreviousValue)) {
            let locale = this.locale.strings,
                changeOrgConfirmMessage = Ext.String.format(locale.changeOrgConfirmMessage);

            Ext.Msg.confirm('Alert', changeOrgConfirmMessage, (btn) => {
                switch (btn) {
                    case 'yes':
                        deferred.resolve();
                        break;
                    case 'no':
                        deferred.reject();
                        break;
                }
            }, this);
        } else {
            deferred.resolve();
        }

        return deferred.promise;
    },

    /**
     * Update status value of model depending Active checkbox
     *
     * @param  {corecheckboxview} checkbox
     * @param  {Boolean} newValue
     * @param  {Boolean} oldValue
     */
    changeDicomProxyActive: function(checkbox, newValue, oldValue) {
        let me = this,
            model = me.getViewModel().get('model');

        // Update status value corresponding to Active checkbox
        model.set({
            status: newValue ? 'active' : 'inactive'
        });
    },

    /**
     * Direct the user to the settings of the organization
     */
    onManagingOrganizationDetails: function() {
        let model = this.getViewModel().get('model'),
            managingOrganizationId = model.get('managingOrganizationId');

        if( managingOrganizationId && managingOrganizationId > 0 ) {
            this.loadEntity(managingOrganizationId, PageConfig.getOrganizationDetail(), managingOrganizationId, 'OrganizationDetail');
        }
    },

    /**
     * Direct the user to the settings of the organization
     */
    onImagingOrganizationDetails: function() {
        let model = this.getViewModel().get('model'),
            imagingOrganizationId = model.get('imagingOrganizationId');

        if( imagingOrganizationId && imagingOrganizationId > 0 ) {
            this.loadEntity(imagingOrganizationId, PageConfig.getOrganizationDetail(), imagingOrganizationId, 'OrganizationDetail');
        }
    },

    /**
     * Handle Export button click.
     */
    onExportClick: function() {
        this.exportConfig("DICOMProxyConfigurable.json");
    },

    /**
     * Return default value of DICOM Proxy Server configurable.
     * @param  {object} jsonData
     */
    getDefaultConfigJson: function() {
        return {
            "PeerCertPath": "C:\\CertificationFolder\\",
            "PKFile": "C:\\CertificationFolder\\pacs.key",
            "CertFile": "C:\\CertificationFolder\\pacs.crt",
            "FolderToStoreImages": "C:\\DicomProxyReceivedImages\\",
            "ProcessingFolder": "C:\\DicomProxyProcessingImages\\",
            "NumberOfReceivingWorkers": "20",
            "NumberOfProcessingWorkers": "4",
            "NumberOfProcessingCoordinators": "4",
            "ImageCacheBasePath": "C:\\Images\\",
            "DicomServer": {
                "DicomServerPort": "104",
                "DicomMaxPDUSize": "65536",
                "DicomListenBackLog": "50",
                "Compression": ["Lossless", "Uncompessed", "Lossy"],
                "JPEGQuality": "75",
                "JP2CompRatio": "30",
                "DicomServerAeTitle": "50",
                "DicomServerTLSPort": "2762"
            }
        };
    },

    /**
     * Get defaul value and update new value from response data for DICOM Proxy Server configurable.
     * @param  {object} responseJson
     */
    createConfigJson: function(responseJson) {
        let configJson = this.getDefaultConfigJson();

        if (responseJson) {
            configJson.PeerCertPath = responseJson.PeerCertPath || configJson.PeerCertPath;
            configJson.PKFile = responseJson.PKFile || configJson.PKFile;
            configJson.CertFile = responseJson.CertFile || configJson.CertFile;
            configJson.FolderToStoreImages = responseJson.FolderToStoreImages || configJson.FolderToStoreImages;
            configJson.ProcessingFolder = responseJson.ProcessingFolder || configJson.ProcessingFolder;
            configJson.NumberOfReceivingWorkers = responseJson.NumberOfReceivingWorkers || configJson.NumberOfReceivingWorkers;
            configJson.NumberOfProcessingWorkers = responseJson.NumberOfProcessingWorkers || configJson.NumberOfProcessingWorkers;
            configJson.NumberOfProcessingCoordinators = responseJson.NumberOfProcessingCoordinators || configJson.NumberOfProcessingCoordinators;
            configJson.ImageCacheBasePath = responseJson.ImageCacheBasePath || configJson.ImageCacheBasePath;

            if (responseJson.DicomServer) {
                let resDicomServer = responseJson.DicomServer,
                    dicomServer = configJson.DicomServer;

                dicomServer.JPEGQuality = resDicomServer.JPEGQuality || dicomServer.JPEGQuality;
                dicomServer.JP2CompRatio = resDicomServer.JP2CompRatio || dicomServer.JP2CompRatio;
                dicomServer.DicomMaxPDUSize = resDicomServer.DicomMaxPDUSize || dicomServer.DicomMaxPDUSize;
                dicomServer.DicomListenBackLog = resDicomServer.DicomListenBackLog || dicomServer.DicomListenBackLog;
                dicomServer.DicomServerAeTitle = resDicomServer.DicomServerAeTitle || dicomServer.DicomServerAeTitle;
                dicomServer.DicomServerPort = resDicomServer.DicomServerPort || dicomServer.DicomServerPort;
                dicomServer.DicomServerTLSPort = resDicomServer.DicomServerTLSPort || dicomServer.DicomServerTLSPort;
                configJson.DicomServer.Compression[0] = responseJson.DicomServer.Compression1 || configJson.DicomServer.Compression[0];
                configJson.DicomServer.Compression[1] = responseJson.DicomServer.Compression2 || configJson.DicomServer.Compression[1];
                configJson.DicomServer.Compression[2] = responseJson.DicomServer.Compression3 || configJson.DicomServer.Compression[2];
            }
        }

        return configJson;
    },

    getModel: function() {
        return this.getViewModel().get('model');
    },

    /**
     * This method will be called to display custom script editor window
    */
   handleCustomScript: function() {
        let me = this,
            viewModel = me.getViewModel(),
            dicomDetails = me.getModel().data,
            title = 'DICOM Script Editor' + ' | ' + dicomDetails.dicomProxyTitle,
            valueString = dicomDetails.customScript;

        if(!me.window) {
            viewModel && viewModel.set({
                customScript: valueString,
                customScriptDraft: dicomDetails.customScriptDraft,
                customScriptDraftLastupdated: dicomDetails.customScriptDraftLastupdated
            });
            me.window = Ext.create('Worklist.view.organization.ProxyEditor', {
                title: title,
                ownerContainerViewModel: me.getView().getViewModel(),
                associateddevice: dicomDetails.name,
                isReadOnlyScript: viewModel.get('isReadOnly')
            });
        }

        me.window.scriptId = dicomDetails.id;
        me.window.show();
    },

    /**
     * Update privilege for Device
     * @param {*} model
     * @param {*} viewModel
     * @param {*} activeTab
     */
    checkPrivilege: function(model, viewModel, activeTab) {
        let me = this,
            canViewHistoryDevice,
            organizationId = viewModel && viewModel.get('organizationModelId');

        // Update privielge history for device base on Organization
        canViewHistoryDevice = Common.utils.Privilege.processPermissionForEachOrg(organizationId, 'Device', 'history');
        me.getViewModel() && me.getViewModel().set('canViewHistory', canViewHistoryDevice);
    },

    /**
     * Load roles into role combobox in each row for given organization.
     * @param {*} parentViewModel
     */
    onLoadRoleEnumeration: function (parentViewModel) {
        let me = this,
            model = parentViewModel && parentViewModel.get('model'),
            organizationId = model && model.get('managingOrganizationId'),
            userRoleItem = me.lookup('RoleCombo'),
            enumCategory = Common.consts.EnumerationConfig.getOrganizationRoles();

        // reload empty list to Role Enum DropDownList
        me.reloadEnumDropDownList(userRoleItem, enumCategory, true);
        // reload Role list base on selected org to Role Enum DropDownList
        me.loadEnumerationByCategory(enumCategory, organizationId).then(() => {
            me.reloadEnumDropDownList(userRoleItem, enumCategory);
        });
    }
});

========================================


decom

/**
 * @Class Worklist.view.organization.NewDeviceViewController
 * @author Sen Pham <spham@ramsoft.com>
 */

Ext.define('Worklist.view.organization.NewDeviceViewController', {
    extend: 'Ext.app.ViewController',

    alias: 'controller.newdeviceviewcontroller',

    requires: [
        'Locale.device_strings',
        'Worklist.core.mixins.CommonButtonMixin'
    ],

    mixins: [
        'Worklist.core.mixins.Services',
        'Worklist.core.mixins.CommonButtonMixin',
        'Common.model.core.DicomEchoTaskModel',
        'Worklist.view.worklist.ServiceBusMixins'
    ],

    topicName: 'taskresponse',
    subscriptionName: 'DicomEcho',

    init: function(view) {
        let me = this,
            viewModel = me.getViewModel();

        me.initDirtyChange('newdevice');

        me.locale = Locale.device_strings;

        me.initLocale(view, me.locale);

        me.onSaveModel(view);

        // Add listener for New Entity view to handle refreshView event.
        viewModel.get('isNewDeviceView') && me.addListenerForEntityView(view);

        me.callParent(arguments);
    },

    initView: function(parentViewModel, clientData, event) {
        let me = this,
        imagingOrganizationId = parentViewModel && parentViewModel.get('imagingOrganizationId'),
        viewmodel = me.getViewModel(),
        isReadOnly = !viewmodel.get('isNewDeviceView') && (!viewmodel.get('privilege.canUpdateDevice') || viewmodel.get('readOnly'));

        parentViewModel && (me.parentView = parentViewModel.getView());

        imagingOrganizationId && (me.lookup('healthcareServiceItem').postfix = 'fhir/healthcareService?organization=' + imagingOrganizationId);
        event && (me.event = event);
        // Show bubble message for read only mode page
        me.showBubbleMessage(isReadOnly);
    },

    onSaveModel: function(view) {
        let me = this,
            locale = Locale.device_strings.strings;

        view.on('SaveModel', function() {
            me.addAssociatedOrganizationWithDicomProxy(view);
            me.saveNewView(view, locale.addSuccessMessage, locale.addFailureMessage, true, true).then(() => {},
                (operation) => {
                    let errorMessage = me.parseErrorMessage(operation) || locale.addFailureMessage;

                    if (me.isDuplicateDeviceName(errorMessage)) {
                        Application.setAlarm(locale.duplicateDeviceMessage);
                    } else {
                        Application.setAlarm(errorMessage);
                    }
                });
        }, me);
    },

    /**
     * Analyze errorMessage is duplicate Device name error message
     * by finding key word 'u_udi_deviceidentifier'
     * @param  {[string]}  errorMessage
     * @return {Boolean}
     */
    isDuplicateDeviceName: function(errorMessage) {
        let result = false;

        if (typeof errorMessage == 'string' &&
            errorMessage.toLowerCase().indexOf('u_udi_deviceidentifier') > -1) {
            result = true;
        }
        return result;
    },

    /*
     * Set associated managing organization with dicom proxy for device when create a new device without healthcare service.
     * Note: Device is associated with only one associated organizationId.
     * @param {Worklist.view.organization.NewDeviceView} view
     */
    addAssociatedOrganizationWithDicomProxy: function(view) {
        let viewModel = view.getViewModel(),
            model = viewModel.get('model');

        if(Ext.isEmpty(model.get('healthcareServiceId'))) {
            model.set({
                'managingOrganizationId': viewModel.managingOrganizationId,
                'managingOrganizationDisplay': viewModel.managingOrganizationDisplay
            })
        }
    },

    /**
     * Set value for tlsConnect field when TlsEnable checkbox is changed.
     * @param  {object} checkbox
     * @param  {boolean} newValue
     * @param  {boolean} oldValue
     * @param  {object} eOpts
     */
    changeTlsEnable: function(checkbox, newValue, oldValue, eOpts) {
        let me = this,
            model = me.getViewModel().get('model');

        // Update status value corresponding to Active checkbox
        model.set({
            tlsConnection: newValue ? '1' : '0'
        });
    },

    /**
     * Check and open Healthcare Service detail page if the record is existed
     */
    onHealthcareServiceDetail: function() {
        let model = this.getViewModel().get('model'),
            healthcareServiceId = model.get('healthcareServiceId');

        if (healthcareServiceId && healthcareServiceId > -1) {
            this.loadEntity(healthcareServiceId, PageConfig.getHealthcareResourceDetails(), healthcareServiceId, 'SaveHealthcareService', function(healthcareServiceModel, scope) {
                let mainModel = scope.getViewModel().get('model');

                mainModel.set({
                    healthcareServiceDisplay: healthcareServiceModel.get('name')
                });
            });
        }
    },

    /**
     * Click handler for "Test Connection" button
     * @param {Ext.Button} btn
     */
    onEchoClick: function(btn) {
        let me = this,
            model = this.getModel ? this.getModel() : this.getViewModel().get('model');

        if (me.getViewModel().get('testingConnection')) {
            // Change button text
            btn.setText(Locale.device_strings.strings.testBtnName);

            // Stop ServiceBus listener
            me.stopReceiveMessages();

            // Stop progress bar
            LoadingProgressBar.hide();

            // Update Fhir Task status
            me.currentEchoTask.set({
                status: 'completed'
            });
            me.currentEchoTask.save();

            me.getViewModel().set('testingConnection', false);
        } else {
            // clear the previous echo tasks
            me.echoTasks = [];

            let echoTask = Ext.create('Common.model.core.DicomEchoTaskModel');

            let errors = [];
            if (Ext.isEmpty(model.get('deviceAETitle'))) {
                errors.push('AE Title');
            }

            if (Ext.isEmpty(model.get('ipAddress'))) {
                errors.push('IP Address');
            }

            if (Ext.isEmpty(model.get('port'))) {
                errors.push('Port');
            }

            if (errors.length > 0) {
                Application.setAlarm('Please ensure ' + errors.join(', ') + ' is not empty');
            } else {
                // perform echo
                echoTask.set({
                    deviceId: model.get('associatedDeviceId'),
                    peerPort: model.get('port'),
                    peerHost: model.get('ipAddress'),
                    deviceAETitle: model.get('deviceAETitle'),
                    associatedDeviceId:model.get('associatedDeviceId'),
                    associatedDeviceDisplay:model.get('associatedDeviceDisplay')
                });

                me.currentEchoTask = echoTask;

                // Change text to "Stop Test"
                btn.setText(Locale.device_strings.strings.stopTestBtnName);

                LoadingProgressBar.show(this.getView(), true);
                me.getViewModel().set('testingConnection', true);

                // POST Task model. record is created for the echoTask,start saving to database
                echoTask.save({
                    scope: me,
                    success: function (record) {
                        if (record && record.id && record.id > 0) {
                            me.echoTasks.push(record.id.toString());
                            me.startReceiveMessages(me.subscriptionName, btn);
                        } else {
                            // Reset button text
                            btn.setText(Locale.device_strings.strings.testBtnName);

                            Application.setAlarm(Worklist.worklist_strings.strings.echoErr);
                        }
                    },
                    failure: function () {
                        // Reset button text
                        btn.setText(Locale.device_strings.strings.testBtnName);
                        
                        Application.setAlarm(Worklist.worklist_strings.strings.echoErr);
                        LoadingProgressBar.hide();
                        me.getViewModel().set('testingConnection', false);
                    }
                });
            }
        }
    },

    /**
     * This function is called by ServiceBusMixins.onTaskComplete to handle Echo completion
     * @param {Object} responseData
     * @param {Ext.Button} btn
     */
    onEchoCompleted: function(responseData, btn) {
        LoadingProgressBar.hide();
        this.getViewModel().set('testingConnection', false);

        btn.setText(Locale.device_strings.strings.testBtnName);

        if (responseData.output[0].valueBoolean) {
            Ext.MessageBox.show({
                title: 'Connection Success',
                message: 'Test Connection Succeeded',
                buttons: Ext.Msg.OK,
                icon: Ext.MessageBox.INFO
            });
        } else {
            Ext.MessageBox.show({
                title: 'Connection Failure',
                message: 'Test Connection Failed',
                buttons: Ext.Msg.OK,
                icon: Ext.MessageBox.ERROR
            });
        }
    }
});


=========================


dataservice

/**
 * @class Worklist.core.mixins.DataServices
 * @author Sergiu Buhatel <sbuhatel@ramsoft.com>
 */

/* global Worklist */

Ext.define('Worklist.core.mixins.DataServices', {

    requires: [
        'Common.consts.PageConfig',
        'Common.model.core.BundleModel',
        'Common.model.core.CodeSystemModel',
        'Common.store.core.ValueSetStore',
        'Ext.data.Store',
        'Worklist.core.factories.ViewFactory',
        'Worklist.core.singletons.Application',
        'Worklist.core.singletons.History',
        'Worklist.core.singletons.Toolbar',
        'Worklist.core.singletons.WaitingMask',
        'Common.components.LoadingProgressBar',
        'Worklist.view.core.NewEntityView',
        'Worklist.view.mixins.Fields',
        'Common.model.core.OperationOutcomeModel'
    ],

    mixins: [
        'Worklist.view.mixins.Fields',
        'Worklist.core.mixins.UiUtilities'
    ],

    // List all enumeration will be load from another store not ValueSet store
    listSpecialEnumeration: {
        role: {
            store: 'Worklist.role.store.RoleStore',
            params: {active: true}
        }
    },

    ajax: function(method, url, configuration) {

        var me = this,
            deferred = new Ext.Deferred();

        var config = me.prepareConfig(configuration);

        let label = "Ajax call " + url;
        console.time(label);
        console.timeStamp(label);

        Ext.Ajax.request({
            url: url,
            method: method,
            scope: config.scope,
            cors: true,
            async : config.async,
            params: config.params,
            useDefaultXhrHeader: config.useDefaultXhrHeader,
            //<if debug>
            //Always to add _dc parameter since IE cache can be used on GET method with caching enabled
            //disableCaching: false, //use compiler directive to not use dc_ param
            //</if>
            headers: {
                'Content-Type':'application/json;charset=UTF-8'
            },

            success : function(result, request) {
                console.timeEnd(label);
                if( config.rawResult ) {
                    deferred.resolve(result);
                } else {
                    var record = me.decode(result.responseText);
                    deferred.resolve(record);
                }
            },
            failure : function(result, request) {
                if (result.status == 404) {
                    deferred.reject(result);
                } else if (result.status == 401) {
                    Application.logout();
                } else if (result.status == 0) {
                    Application.logout();
                } else {
                    var reason = me.getReason(result);
                    deferred.reject(reason);
                }
            }
        });

        return deferred.promise;
    },

    handleStoreLoadFailure: function(operation) {
        let errorMessage =  this.parseErrorMessage(operation);

        Application.setAlarm(errorMessage);
    },

    /**
     * Given an operation, retrieve the error message
     */
    parseErrorMessage: function(operation) {
        let errorMessage;

        if (operation && operation.error) {
            let responseJson = operation.error.response.responseJson;

            if (responseJson) {
                let model = this.parseOperationOutcome(operation);

                errorMessage = model.get('diagnostics') || model.get('details');
            } else if (operation.error.status == 401) {
                errorMessage = 'Your session has expired';
            } else  if (operation.error.status == 404) {
                errorMessage = 'The URL cannot be found: ' + operation.getProxy().getUrl();
            }
        }

        return errorMessage;
    },

    /**
     * Take the operation outcome json and converts it into a model
     * @param {string} operation
     */
    parseOperationOutcome: function(operation) {
        if (operation && operation.error) {
            let responseJson = operation.error.response.responseJson;

            if (responseJson) {
                return OperationOutcomeModel.loadData(responseJson);
            }
        }

        return null;
    },

    prepareConfig: function(config) {
        if( config == undefined || config == null ) {
            config = new Object();
        }

        if( config.params && !config.disableEncoding ) {
            config.params = Ext.util.JSON.encode(config.params);
        }

        if( config.async == undefined || config.async == null ) {
            config.async = true;
        }

        if (config.useDefaultXhrHeader == undefined || config.useDefaultXhrHeader == null) {
            config.useDefaultXhrHeader = true;
        }

        config.scope = config.scope || this;

        return config;
    },

    // This is fixing one issue when is passed an empty string to decode
    decode: function(text) {
      var decoded = text;
      if(text && text != "") {
          decoded = Ext.util.JSON.decode(text);
      }

      return decoded;
    },

    // TODO: We should normalize the error messages
    getReason: function(result) {
        var reason = "",
            message = "";

        if(result.responseText) {
            reason = result.responseText;
        } else if(result.statusText) {
            reason = result.statusText;
        } else {
            message = this.decode(result.responseText);

            if(message && message.id && message.id[0]) {
                reason = message.id[0];
            } else if(message && message.id && message.id[0]) {
                reason = message.id[0];
            } else if(message && message.issue && message.issue[0] && message.issue[0].diagnostics) {
                reason = message.issue[0].diagnostics;
            } else if(message && message.text && message.text.div) {
                reason = message.text.div;
                reason = reason.replace("<div>", "");
                reason = reason.replace("<\/div>", "");
            } else if(message && message.text && message.text.div) {
                reason = message.text.div;
                reason = reason.replace("<div>", "");
                reason = reason.replace("<\/div>", "");
            }
        }

        return reason;
    },

    /**
     * Load enumerations from server with itemId
     * @param  {String} itemId
     * @return {Ext.Promise} A promise that is resolved with enumerations
     */
    doLoadEnumerations: function(itemId) {
        let me = this,
            deferred = new Ext.Deferred(),
            valueSetStore = Ext.create('Common.store.core.ValueSetStore'),
            //Set params if have itemId
            param = itemId ? {"name:exact": itemId, _count: 1000} : {_count: 1000}; // The _count is the max number of Enumerations. If the needed ValueSet is greater then 1000, do a metasearch

        // Using asap method to get callback data immediately
        Ext.asap(function() {
            let specialEnumConfig;

            // Almost enumeration will be loaded from ValueSet store except enumerations in special enum list
            if ((specialEnumConfig = me.listSpecialEnumeration[itemId]) && specialEnumConfig.store) {
                me.loadEnumerationFromSpecificStore(itemId, specialEnumConfig.store, specialEnumConfig.params).then((enumerations) => {
                    deferred.resolve(enumerations);
                }, () => {
                    deferred.reject();
                });
            } else {
                valueSetStore.load({
                    params: param,
                    callback: function(records, operation, success) {
                        if (success) {
                            // Convert data structure from ValueSet API
                            let data = me.convertStructureData(records);
                            deferred.resolve(data);
                        } else {
                            deferred.reject('No enumeration loaded.');
                        }
                    }
                });
            }
        });

        return deferred.promise;
    },

    /**
     * Load enumerations from server or local with itemId
     * @param  {String} itemId
     * @param  {Boolean} refresh
     * @return {Object} An enum with itemId
     */
    loadEnumerationsItem: function(itemId, refresh = false) {
        let me = this,
            enumerationsItem = {};

        if(refresh || Ext.isEmpty(Application.getEnumerations()) || Ext.isEmpty(Application.getEnumerations()[itemId])) {
            // Do the first load
            return me.doLoadEnumerations(itemId).then((record) => {
                if (!Application.getEnumerations()) {
                    Application.setEnumerations({});
                }
                // cache as global
                Application.getEnumerations()[itemId] = record[itemId];
                return Ext.Deferred.resolved(record);
            });
        } else {
            enumerationsItem[itemId] = Application.getEnumerations()[itemId];
            return Ext.Deferred.resolved(enumerationsItem);
        }
    },

    /**
     * Convert data structure from ValueSet API
     *
     * Input:
     * records: [
     *     data: {
     *        name: "CommunicationFolder"
     *         concept: [{
     *             enumerationObject: {
     *                id: "Inbox",
     *                value: "Inbox",
     *                active: true
     *             }
     *         }]
     *     }
     * ]
     *
     * Output:
     * valueSetObject: {
     *     communicationFolder : [{
     *         id: "Inbox",
     *         value: "Inbox",
     *         active: true
     *   }]
     * }
     *
     * @param  {Object} record
     * @return {Object} valueSetObject
     */
    convertStructureData: function(records) {
        let valueSetObject = {},
            valueSetArray;

        Ext.each(records, function(rec) {
            valueSetArray = [];

            Ext.each(rec.data.concept, function(item) {
                // There enumerations should provide typeof id is number
                if (['NoteColor', 'encounterReasonCodes', 'NoteOrdinalDate', 'NoteMonth'].indexOf(rec.data.name) >= 0) {
                    item.enumerationObject.id = Number(item.enumerationObject.id);
                }
                valueSetArray.push(item.enumerationObject);
            });

            // The fisrt character of name should be map with the old API
            valueSetObject[rec.data.name.charAt(0).toLowerCase() + rec.data.name.substring(1)] = valueSetArray;
        });
        return valueSetObject;
    },

    loadEnumerationStore: function(record, category, comboBoxItemId, view) {
        var combobox = view ? view : this.getComponentByItemId(comboBoxItemId, view);
        return this.loadEnumerationStoreIntoCombobox(record, category, combobox);
    },

    loadEnumerationStoreIntoCombobox: function(record, category, combobox) {
        if(combobox == undefined) {
            console.log("Undefined combobox for: " + category);
            return;
        }

        if(record && record[category]) {
            var store = Ext.create('Ext.data.Store', {
                fields: ['id', 'value'],
                data: this.localizeDisplayValue(record[category], combobox)
            });

           if (!combobox.events) {
               combobox.events = {};
           }

           combobox.setStore(store);

        } else {
            Logger.log("Undefined combobox data record for: " + category);
        }
    },

    /**
     * Perform localizing the value of the enumeration if this field need to be translated
     * @param  {Ext.form.field.ComboBox } combobox
     * @param  {Object} record
     * @param  {String} dataEnumerationId
     */
    localizeDisplayValue: function (enumerations, combobox) {
        var localizationKey = combobox.localizationKey,
            newEnumerations = [],
            rawDataLength, i, parentViewModelData;

        // If it is the field that will be translated key to correct localization
        // and the combobox is still in the GUI
        if (localizationKey && enumerations && !combobox.destroyed) {
            rawDataLength = enumerations.length;
            // Lookup to the parent model that define the localization
            parentViewModelData = combobox.up().lookupViewModel().getData();

            // The view model has this key
            // The model has this key
            for (i = 0; i < rawDataLength; i++) {
                var enumeration = Ext.clone(enumerations[i]), // Not touch in the original data
                    displayValue = enumeration[localizationKey];

                // If the enumeration has the localization key
                // and that value is defined in the viewmodel
                // then replace this value by the text which is defined in the VM
                if (displayValue && parentViewModelData.hasOwnProperty(displayValue)) {

                    enumeration[localizationKey] = parentViewModelData[displayValue];
                    // Push the updated enumeration to the new array
                    newEnumerations.push(enumeration);
                }
            }
        }

        // If it updates any enumerations, use new enumerations data instead
        return newEnumerations.length > 0 ? newEnumerations : enumerations;
    },

    loadModel: function (id, modelName, isCodeSystemPage = false) {
        var deferred = new Ext.Deferred(),
            record = Ext.create(modelName);

        // if privilege to view resource is missing, do not load view
        if (!Common.utils.Privilege.processPermission(record.get('resourceType'), 'read')) {
            deferred.reject(`You do not have the necessary privilege to view ${record.get('resourceType')} information. Please contact your administrator for assistance.`);
        }

        if (isCodeSystemPage) {
            // All specific code system model (ex: Study Status, Procedure model) use identry as identifier.
            // Note: use identry for searching specific code system instance (ex CodeSystem?name:exact=ProcedureCode&identry=123)
            record.set('identry', id);
        } else {
            record.set({id});
            record.appendPostfixUrl(id);
        }
        record.load({
            scope: this,
            success: function (record) {
                deferred.resolve(record);
            },
            failure: function (record, operation) {
                if (operation.error && operation.error.status == 401) {
                    Application.logout();
                } else {
                    let errorMessage = this.parseErrorMessage(operation);
                    deferred.reject(errorMessage);
                }
            }
        });

        return deferred.promise;
    },

    loadView: function(record, viewName, readOnly = false) {
        var view = ViewFactory.createInstance(viewName),
            viewModel = view.getViewModel();

        view.fireEvent('beforeinitview');

        viewModel.set('readOnly', readOnly);

        if (typeof viewModel.setModel == "function") {
            viewModel.setModel(record);
        } else {
            console.log("WARNING: Undefined setModel() inside view model of " + viewName);
        }

        if (typeof viewModel.initView == "function") {
            viewModel.initView();
            view.fireEvent('initview');
        } else {
            console.log("WARNING: Undefined initView() inside view model of " + viewName);
        }

        return view;
    },

    loadPageWithExistingObject: function(id, config, activetab) {
        var me = this,
            deferred = new Ext.Deferred();

        if (config && config.model && config.view) {
            LoadingProgressBar.show(Application.getCurrentView());

            me.loadModel(id, config.model, config.isCodeSystemPage).then(
                function(record) {
                    var view = me.loadView(record, config.view);
                    if (activetab && !view.getViewModel().get('blockAccess')) {
                        view.setActiveTab(activetab);
                    }
                    LoadingProgressBar.hide();
                    deferred.resolve(view);
                },
                function(message) {
                    let record = Ext.create(config.model);
                    me.loadView(record, config.view, true /*readOnly*/);

                    Application.setAlarm(message);
                    LoadingProgressBar.hide();
                    deferred.reject();
                },
                null, me
            );
        } else {
            deferred.reject();
        }

        return deferred.promise;
    },

    loadPageWithNewObject: function(config) {
        var deferred = new Ext.Deferred();

        LoadingProgressBar.show(Application.getCurrentView());

        if(config && config.view) {
            var view = ViewFactory.createInstance(config.view),
                viewModel = view.getViewModel();

            view.fireEvent('beforeinitview');

            if (config.isCodeSystemPage) {
                viewModel.set({
                    model: Ext.create('Common.model.core.CodeSystemModel', {
                        name: config.codeSystemName
                    }),
                    isCodeSystemPage: config.isCodeSystemPage
                });
            }

            if(typeof viewModel.createModel == "function") {
                viewModel.createModel();
            }  else {
                console.log("WARNING: Undefined createModel() inside view model of " + config.view);
            }
            if(typeof viewModel.initView == "function") {
                viewModel.initView();
                view.fireEvent('initview');
            } else {
                console.log("WARNING: Undefined initView() inside view model of " + config.view);
            }

            deferred.resolve(view);
        } else {
            console.log("WARNING: Page could not be loaded!");
            deferred.reject();
        }

        LoadingProgressBar.hide();

        return deferred.promise;
    },

    /**
     * Loads a page given an existing record
     * @param record
     * @param config
     */
    loadPageWithRecord: function(record, config) {
        var deferred = new Ext.Deferred();

        this.initFields().then(()=> {
            var view = this.loadView(record, config.view);
            deferred.resolve(view);
        });

        return deferred.promise;
    },

    loadPage: function(config, id, opt) {
        return this.initFields(config).then(() => {
            if (id) {
                return this.loadPageWithExistingObject(id, config, opt);
            } else {
                return this.loadPageWithNewObject(config, opt);
            }
        }, null, null, this);
    },

    registerNewEntityEventHandler: function(clientData, event, eventHandler, scope) {
        let me = this,
            view = me.getView();

        if (event == undefined || eventHandler == undefined || scope == undefined) {
            return;
        }

        if (me['register' + event] == undefined || !view.hasListener(event.toLowerCase())) {
            me['register' + event] = view.on(event, function(clientData) {
                if (eventHandler && typeof eventHandler == 'function') {
                    // Resume event for row editor since it has been suspended when opening new entity
                    me.resumeAllRowEditorEvents(view);
                    eventHandler(clientData, scope);
                }
            }, me, {destroyable: true});
        }
    },

    /**
     * @param  {Object} [config]
     * @param  {String} [config.view]           View's name
     * @param  {String} [config.model]          Model's name
     * @param  {Boolean}[config.isLocalCommit] Set to TRUE to save this view locally when clicking on 'Save' button
     */
    createNewEntity: function(config, clientData, event, eventHandler) {
        let deferred = new Ext.Deferred(),
            me = this;

        if(config && config.view) {
            this.hideAllToolTips();
            // Hide bubble message when new entity
            me.hideBubbleMessage();

            var newView = ViewFactory.createInstanceNewEntity(config.view, config.ownerInfo),
                newViewPanel = newView.lookup('newentitywrapperreference'),
                contentView, viewModel,
                parentViewModel = this.getViewModel();

            contentView = Ext.create(config.view, {
                isAnEntity: true,
                reference: 'embeddedview',
                isLocalCommit: config.isLocalCommit
            });
            viewModel = contentView.getViewModel();

            newViewPanel.add(contentView);

            if(typeof viewModel.createModel == "function") {
                viewModel.createModel();
            }
            if(typeof viewModel.initView == "function") {
                viewModel.initView(parentViewModel, clientData, event);
                // Disable auto-refresh plugin
                newView.fireEvent('initview');
            }

            this.registerNewEntityEventHandler(clientData, event, eventHandler, this);

            deferred.resolve(contentView);
        } else {
            console.log("WARNING: New Entity could not be created!");
            deferred.reject();
        }

        return deferred.promise;
    },

    createEntity: function(config, clientData, event, eventHandler) {
        let me = this;

        return me.initFields().then(
            function() {
                // Disable Record History button
                Application.collapseAlarm();
                Toolbar.disableRecordHistory();
                Toolbar.updateAlertToolbarButton(true);

                // When we open a new entity for a field in grid,
                // the tooltip will be hidden and "detached" meaning it will not be linked to any DOM
                // which will result in an error. So should suspend events of row editor
                // to prevent call to repositionTip method which will cause the error.
                me.suspendAllRowEditorEvents();

                return me.createNewEntity(config, clientData, event, eventHandler);
            },
            function(message) {
                Application.setAlarm(message);
            },
            null, me
        );
    },

    /**
     * @param  {Object} [config]
     * @param  {String} [config.view]           View's name
     * @param  {String} [config.model]          Model's name
     * @param  {Boolean}[config.isLocalCommit] Set to TRUE to save this view locally when clicking on 'Save' button
     */
    loadEntityView: function(record, config, clientData, event, eventHandler) {
        let deferred = new Ext.Deferred(),
            me = this;

        if(config && config.view) {
            //Hide all tooltips for roweditor
            //If we don't hide the tooltip explicitly, the framework will automatically hide it, and then when we close the entity, the tooltip
            //will be shown again. However, when a tooltip gets hidden, it will be 'detached' meaning it will not be linked to any DOM which
            //will result in an error after it is automatically shown again. Not sure if this is a framework bug or not but we can work around it.
            this.hideAllToolTips();
            // Hide bubble message when load View
            me.hideBubbleMessage();

            var newView = ViewFactory.createInstanceNewEntity(config.view, config.ownerInfo),
                newViewPanel = newView.lookup('newentitywrapperreference'),
                contentView, viewModel,
                parentViewModel = this.getViewModel();

            contentView = Ext.create(config.view, {
                isAnEntity: true,
                reference: 'embeddedview',
                isLocalCommit: config.isLocalCommit
            });
            viewModel = contentView.getViewModel();

            newViewPanel.add(contentView);

            if(typeof viewModel.setModel == "function") {
                viewModel.setModel(record);
            }
            if(typeof viewModel.initView == "function") {
                viewModel.initView(parentViewModel, clientData, event);
                contentView.fireEvent('initview');
            }

            newView.parentEventName = event;
            this.registerNewEntityEventHandler(clientData, event, eventHandler, this);

            deferred.resolve(contentView);
        } else {
            console.log("WARNING: New Entity could not be created!");
            deferred.reject();
        }

        return deferred.promise;
    },

    getModelShortName: function(modelFullName) {
        var tokens = modelFullName.split('.'),
            shortName = "",
            length = tokens.length;

        if(length > 0) {
            shortName = tokens[length - 1];
        }
        shortName = shortName.replace('Model', '');

        return shortName;
    },

    /**
     * Reload entity data from server
     * @param  {corenewentityview} entityView Entity view
     */
    reloadEntityHelper: function (entityView) {
        var me = this,
            entityWrapperView = entityView.getController().lookup('newentitywrapperreference').down(),
            viewModel = entityWrapperView.getViewModel(),
            model = viewModel.get('model'),
            modelName = model.$className,
            recordId = model.get('id'),
            clientData = this.getModelShortName(modelName);

        // Discard all unsaved changes
        viewModel.setModel(Ext.create(modelName));
        entityWrapperView.getController().setDirtyFlag(false);
        LoadingProgressBar.show(Application.getCurrentView());

        return this.initFields().then(
            function() {
                // In case, about new entity. We don't need to get data from server, just clear model
                if (!Ext.isNumeric(recordId) || recordId == -1) {
                    // Create new model
                    if (Ext.isFunction(viewModel.createModel)) {
                            viewModel.createModel();
                    }
                    // Fire initview event for current view
                    if (Ext.isFunction(viewModel.initView)) {
                        viewModel.initView(viewModel, clientData, event);
                        entityWrapperView.fireEvent('initview');
                    }
                    LoadingProgressBar.hide();
                } else { // In case, about existing entity. We need to request data from server and populate data again
                    return me.loadModel(recordId, modelName).then(
                        function(record) {
                            if (record.id !== recordId) {
                                // duplicate record to reset the id to -1
                                record.set('id', recordId);
                            }
                            // Set server data to view model
                            if (Ext.isFunction(viewModel.setModel)) {
                                viewModel.setModel(record);
                            }
                            // Fire initview event for current view
                            if (Ext.isFunction(viewModel.initView)) {
                                viewModel.initView(viewModel, clientData, event);
                                entityWrapperView.fireEvent('initview');
                            }
                            LoadingProgressBar.hide();
                        },
                        function(message) {
                            Application.setAlarm(me.clientData + ': ' + message);
                            LoadingProgressBar.hide();
                        },
                        null, me
                    );
                }
            },
            function(message) {
                Application.setAlarm(message);
                LoadingProgressBar.hide();
            },
            null, this
        );
    },

    loadEntityHelper: function(id, config, clientData, event, eventHandler) {
        var recordId = id,
            deferred = new Ext.Deferred();

        this.clientData = this.getModelShortName(config.model);

        if (config && config.model && config.view) {
            LoadingProgressBar.show(Application.getCurrentView());

            // If id is a Model, the load entity view from that
            if (id.isModel) {
                var view = this.loadEntityView(id, config, clientData, event, eventHandler);

                LoadingProgressBar.hide();
                deferred.resolve(view);
            } else { // Load data from server by id before loading to entity view
                this.loadModel(recordId, config.model, config.isCodeSystemPage).then(
                    function(record) {
                        if (record.id != recordId) {
                            // duplicate record to reset the id to -1
                            record.set('id', recordId);
                        }
                        var view = this.loadEntityView(record, config, clientData, event, eventHandler);
                        LoadingProgressBar.hide();
                        deferred.resolve(view);
                    },
                    function(message) {
                        Application.setAlarm(message);
                        LoadingProgressBar.hide();
                        deferred.reject();
                    },
                    null, this
                );
            }
        } else {
            console.log("WARNING: Entity could not be loaded!");
            deferred.reject();
        }

        return deferred.promise;
    },

    loadEntity: function(id, config, clientData, event, eventHandler) {
        let me = this;
        
        return this.initFields(config).then(
            function() {
                Application.collapseAlarm();
                Toolbar.disableRecordHistory();
                Toolbar.updateAlertToolbarButton(true);

                return me.loadEntityHelper(id, config, clientData, event, eventHandler);
            },
            function(message) {
                Application.setAlarm(message);
            },
            null, this
        );
    },

    isAnEntity: function(view) {
        return ViewFactory.isAnEntity(view);
    },

    /**
     * @param model
     * @param successMsg
     * @param failureMsg
     * @param notCallAlarmMsg: Flag to call alarm error message
     * @returns {Ext.Deferred}
     * @private
     */
    saveModel: function(model, successMsg, failureMsg, notCallAlarmMsg) {
        let me = this,
            deferred = new Ext.Deferred();

        // Disable Save button and dirty flag, so that if user presses multiple times the
        // save button it will not trigger multiple save transactions.
        this.setDirtyFlag(false);

        failureMsg = failureMsg || "Error when Saving";

        if(!model.isValid()) {
            // Enable again the save button, as the save failed due to a client validation error
            this.setDirtyFlag(true);

            var validationErrors = model.getValidationErrors();
            Application.setAlarm(validationErrors);
            deferred.reject();
            return deferred.promise;
        }

        model.save({
            scope: me,
            success: function(record) {
                // Show a toast upon success
                if (successMsg > '') {
                    Ext.toast(successMsg);
                }
                Application.collapseAlarm();

                // Call the callback from the promise
                deferred.resolve(record);
            },
            failure: function(record, operation) {
                // Enable again the save button, as the save failed due to a server validation error
                me.setDirtyFlag(true);

                let errorMessage = me.parseErrorMessage(operation) || failureMsg;

                Ext.toast(failureMsg);

                // Reject with operation in order to custom error message
                if(notCallAlarmMsg) {
                    deferred.reject(operation);
                } else {
                    Application.setAlarm(errorMessage);
                    deferred.reject(record);
                }

            }
        });

        return deferred.promise;
    },

    /**
     * Perform local/server saving
     * @param  {Ext.Container} view
     * @param  {Object} [configs] This is passed into @performViewAction function
     * @param  {Boolean} [configs.autoSave]
     * @param  {Boolean} [configs.autoClose]
     * @param  {Boolean} [configs.notCallAlarmMsg]
     * @param  {Ext.data.Model} [configs.model]
     * @param  {Ext.data.Model} [configs.successMsg]
     * @param  {Ext.data.Model} [configs.failureMsg]
     * @return {Boolean}
     */
    performSaving: function(view, configs) {
        let { model, successMsg, failureMsg, notCallAlarmMsg } = configs,
            deferred = new Ext.Deferred();

        if (view.isLocalCommit) {
            // Just perform view action if local saving
            this.performViewAction(configs);

            deferred.resolve(model);
        } else {
            // Perform saving to server
            this.saveModel(model, successMsg, failureMsg, notCallAlarmMsg).then((record) => {

                // Disable Save button and dirty flag, so that if the execution is successful.
                this.setDirtyFlag(false);

                // Perform view action after saving
                this.performViewAction(configs);
                deferred.resolve(record);
            }, (record) => {
                deferred.reject(record);
            });
        }
        return deferred.promise;
    },

    /**
     * @param  {Object} [configs]
     * @param  {Boolean} [configs.autoSave]
     * @param  {Boolean} [configs.autoClose]
     * @param  {Ext.data.Model} [configs.model]
     * @param  {Ext.data.Model} [configs.successMsg]
     * @param  {Ext.data.Model} [configs.failureMsg]
     */
    performViewAction: function(configs) {
        let { autoSave, autoClose, model } = configs;

        // Note: ensure that parent can update information after saving, even if the view hasn't been closed yet. (Issue #53545)
        // Send message to the parent view, for update
        if (this.parentView && this.event) {
            this.parentView.fireEvent(this.event, model);
        }

        if (!autoSave) {
            // Go to the previous view
            if (autoClose) {
                History.restorePreviousRoute();
            }
        }
    },

    saveView: function(view, successMsg, failureMsg, autoSave = false, autoClose = true, notCallAlarmMsg = false) {
        let viewModel = view.getViewModel(),
            model = viewModel.get('model'),
            configs = { model, successMsg, failureMsg, autoSave, autoClose, notCallAlarmMsg };

        return this.performSaving(view, configs).then((record) => {
            // Disable Save button and dirty flag, so that if the execution is successful.
            this.setDirtyFlag(false);

            return record;
        });
    },

    //todo: delete - I think this may not be required anymore due to an update in pattern
    notifyAncestors: function(view, record) {
        var controller = this,
            event = this.event,
            parentView = this.parentView,
            model = record,
            currentView = view;

        // Flag the success
        if(this.parentView && this.event) {
            view.fireEvent('entitysavedsuccessfull', view);
        }

        // Send message to all ancestors up to the first page, for update, and instruct the first one to close.
        while(parentView && event) {
            parentView.fireEvent(event, model );

            if(this.isAnEntity(currentView) == false) {
                break;
            }

            currentView = parentView;
            controller = currentView.getController();
            event = controller.event;
            model = currentView.getViewModel().get('model');
            parentView = controller.parentView;
        }
    },

    saveNewView: function(view, successMsg, failureMsg, autoClose = true, notCallAlarmMsg = false) {
        let viewModel = view.getViewModel(),
            model = viewModel.get('model'),
            configs;

        model.phantom = true;
        configs = { model, successMsg, failureMsg, autoSave: false, autoClose, notCallAlarmMsg };

        return this.performSaving(view, configs).then((record) => {
            return record;
        });
    },

    saveBundleView: function(view, dataArray, successMsg, failureMsg, autoSave = false, autoClose = true, twoStepsSaving, notCallAlarmMsg = false) {
        let bundleModel = Ext.create('BundleModel'),
            deferred = new Ext.Deferred(),
            configs;

        bundleModel.appendPostfixUrl();
        if (twoStepsSaving) {
            bundleModel.addData(dataArray);
            bundleModel.buildBundleData(true);

            if (bundleModel.get('entry').length > 0) {
                configs = { model: bundleModel, successMsg, failureMsg, autoSave, autoClose: false, notCallAlarmMsg };
                this.performSaving(view, configs).then((record) => {
                    // create new model to post
                    let bundleModelForSecondSaving = Ext.create('BundleModel');
                    bundleModelForSecondSaving.addData(dataArray);
                    bundleModelForSecondSaving.buildBundleData(false);
                    let configsForSecondSaving = { model: bundleModelForSecondSaving, successMsg, failureMsg, autoSave, autoClose, notCallAlarmMsg};
                    if (bundleModelForSecondSaving.get('entry').length > 0) {
                        return this.performSaving(view, configsForSecondSaving).then((record) => {
                            // Disable Save button and dirty flag, so that if the execution is successful.
                            this.setDirtyFlag(false);
                            deferred.resolve(record);
                            this.fireEvent('completeSaving');
                        });
                    } else {
                        if (!autoSave && autoClose) {
                            History.restorePreviousRoute();
                        }
                        // Disable Save button and dirty flag, so that if the execution is successful.
                        this.setDirtyFlag(false);
                        deferred.resolve(record);
                        this.fireEvent('completeSaving');
                    }
                });
            } else {
                configs = { model: bundleModel, successMsg, failureMsg, autoSave, autoClose, notCallAlarmMsg};
                bundleModel.buildBundleData(false);
                if (bundleModel.get('entry').length > 0) {
                    return this.performSaving(view, configs).then((record) => {
                        // Disable Save button and dirty flag, so that if the execution is successful.
                        this.setDirtyFlag(false);
                        deferred.resolve(record);
                        this.fireEvent('completeSaving');
                    });
                } else {
                    // If there are no date to actually save just resolve the promise
                    this.setDirtyFlag(false);
                    if (!autoSave && autoClose) {
                        History.restorePreviousRoute();
                    }
                    deferred.resolve(dataArray);
                    this.fireEvent('completeSaving');
                }
            }
        } else {
            bundleModel.addData(dataArray);
            bundleModel.buildBundleData();
            configs = { model: bundleModel, successMsg, failureMsg, autoSave, autoClose, notCallAlarmMsg };

            if (bundleModel.get('entry').length > 0) {
                this.performSaving(view, configs).then((record) => {
                    // Disable Save button and dirty flag, so that if the execution is successful.
                    this.setDirtyFlag(false);
                    deferred.resolve(record);
                    this.fireEvent('completeSaving');
                }, (record) => {
                    deferred.reject(record)
                });
            } else {
                // If there are no date to actually save just resolve the promise
                this.setDirtyFlag(false);
                if (!autoSave && autoClose) {
                    History.restorePreviousRoute();
                }
                deferred.resolve(dataArray);
                this.fireEvent('completeSaving');
            }
        }
        return deferred.promise;
    },

    /**
     * Load enum from specific store (not ValueSet) and set data into enumeration
     * to use it in combobox
     * @param  {String} enumerationId
     * @param  {Ext.data.Store} store
     * @param  {Object} params
     */
    loadEnumerationFromSpecificStore: function(enumerationId, store, params) {
        let enumStore = Ext.create(store),
            deferred = new Ext.Deferred();

        enumStore.load({
            params: params,
            callback: function(records, operation, success) {
                if (success) {
                    let enumeration = {};

                    enumeration[enumerationId] = records.map(function(element) {
                        return element.getData();
                    });
                    deferred.resolve(enumeration);
                } else {
                    deferred.reject();
                }

            }
        });

        return deferred.promise;
    }
});

