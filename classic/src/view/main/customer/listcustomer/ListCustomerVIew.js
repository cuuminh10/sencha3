/**
 * This view is an example list of people.
 */
Ext.define('NewExtApp.view.main.customer.listcustomer.ListCustomerVIew', {
    extend: 'Ext.grid.Panel',
    xtype: 'listCustomervIew',

    requires: [
        'NewExtApp.store.Customer'
    ],

    store: {
        type: 'customerstore'
    },

    columns: [
        { text: 'Name',  dataIndex: 'name' },
        { text: 'Email', dataIndex: 'email', flex: 1 },
        { text: 'Phone', dataIndex: 'phone', flex: 1 },
        {
            xtype: 'actioncolumn',
            items: [{
                iconCls: 'x-fa fa-trash green icon-margin'
            }],
            flex: 1
        }
    ]
});