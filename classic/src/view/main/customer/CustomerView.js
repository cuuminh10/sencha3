/**
 * This class is the main view for the application. It is specified in app.js as the
 * "mainView" property. That setting automatically applies the "viewport"
 * plugin causing this view to become the body element (i.e., the viewport).
 *
 * TODO - Replace this content of this view to suite the needs of your application.
 */
Ext.define('NewExtApp.view.main.custimer.CustomerView', {
    extend: 'Ext.panel.Panel',
    xtype: 'customerview',
    controller: {type: 'customercontroller'},

    layout: 'column',
    
    bodyStyle: "background: transparent",
    
    config: {
        cls: 'app-menu'
    },

    defaults: {
       // bodyPadding: 10,
        height: 300,
        scrollable: true,
        cls: 'app-menu',
        width:800
    },


    items: [
    {
        title: 'CUSTOMER',
        icon: null,
        tbar: {
            items: [{
                xtype: 'splitbutton',
                text: 'Menu Button',
                iconCls: null,
                glyph: 61,
                menu: [{
                    text: 'Menu Button 1'
                }]
            }, {
                xtype: 'splitbutton',
                text: 'Cut',
                iconCls: null,
                glyph: 67,
                menu: [{
                    text: 'Cut Menu Item'
                }]
            }, {
                iconCls: null,
                glyph: 102,
                text: 'Copy'
            }, {
                text: 'Paste',
                iconCls: null,
                glyph: 70,
                menu: [{
                    text: 'Paste Menu Item'
                }]
            }, {
                iconCls: null,
                glyph: 76,
                text: 'Add',
                handler: 'onEditCustomer'
            }]
        },
        xtype: 'listCustomervIew'
    }]

});

