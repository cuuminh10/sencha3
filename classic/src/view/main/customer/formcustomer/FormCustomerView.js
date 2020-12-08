/**
 * Demonstrates a form with two columns.
 */
Ext.define('NewExtApp.view.main.formcustomer.FormCustomerView', {
    extend: 'Ext.form.Panel',
    xtype: 'formcustomerview',

    requires: [],

    controller: {type: 'customercontroller'},
    viewModel: {type: 'customerviewmodel'},

    title: 'Multi Column Form',
    frame: true,
    resizable: true,
    width: 610,
    minWidth: 610,
    minHeight: 300,
    bodyPadding: 0,
    layout: 'column',

    defaults: {
        layout: 'form',
        xtype: 'container',
        defaultType: 'textfield',
        style: 'width: 50%'
    },

    items: [{
        items: [
            { fieldLabel: 'First Name' },
            { fieldLabel: 'Last Name' },
            { fieldLabel: 'Phone Number' },
            { fieldLabel: 'Email Address' }
        ]
    }, {
        items: [
            { fieldLabel: 'Street Address 1' },
            { fieldLabel: 'Street Address 2' },
            { fieldLabel: 'City, State' },
            { fieldLabel: 'ZIP code' }
        ]
    }],

    buttons: [
        { text: 'OK' , handler: 'onBtnSave'},
        { text: 'Cancel' }
    ]
});