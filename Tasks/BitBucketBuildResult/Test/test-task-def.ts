require("should");

const taskConfig = require("../task.json");

describe("The task manifest file", function() {
    it("should contain a valid GUID as ID", function() {
        taskConfig.should.have.a.property("id");
        taskConfig.id.should.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
});
