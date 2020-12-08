/*
 * This file launches the application by asking Ext JS to create
 * and launch() the Application class.
 */
Ext.application({
    extend: 'NewExtApp.Application',

    name: 'NewExtApp',

    requires: [
        // This will automatically load all classes in the NewExtApp namespace
        // so that application classes do not need to require each other.
        'NewExtApp.*'
    ],

    // The name of the initial view to create.
    mainView: 'NewExtApp.view.main.Main'
});
