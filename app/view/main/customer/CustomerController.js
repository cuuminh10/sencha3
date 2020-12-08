/**
 * This class is the controller for the main view for the application. It is specified as
 * the "controller" of the Main view class.
 */
Ext.define('NewExtApp.view.main.customer.customercontroller', {
    extend: 'Ext.app.ViewController',

    alias: 'controller.customercontroller',

    onItemSelected: function (sender, record) {
        Ext.Msg.confirm('Confirm', 'Are you sure?', 'onConfirm', this);
    },

    onConfirm: function (choice) {
        if (choice === 'yes') {
            //
        }
    },

    onEditCustomer: function () {
        let me = this,
            newView = Ext.create('NewExtApp.view.main.formcustomer.FormCustomerView');

         me.getView().removeAll();
         me.getView().add(newView);
        
       // me.getView().items.push(newView)

    },

    onBtnSave: function () {
        let me = this,
        newView = Ext.create('NewExtApp.view.main.custimer.CustomerView');

     me.getView().removeAll();
     me.getView().add(newView);
    
    }

});
