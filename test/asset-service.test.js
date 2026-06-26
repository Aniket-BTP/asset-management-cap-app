const cds = require("@sap/cds");

const { GET, POST, expect } = cds.test("serve", "all", "--in-memory").in(__dirname + "/..");

const authenticateAs = (username) => ({
  auth: {
    username,
    password: "welcome"
  }
});

describe("AssetService authorization", () => {
  it("returns the current Employee user and role flags", async () => {
    const { data } = await GET(
      "/odata/v4/asset/getCurrentUser()",
      authenticateAs("employee2@company.com")
    );

    expect(data).to.include({
      id: "employee2@company.com",
      isEmployee: true,
      isHRApprover: false,
      isApprover: false,
      isAdmin: false
    });
  });

  it("allows an Employee to read only assets assigned to that employee", async () => {
    const { data } = await GET(
      "/odata/v4/asset/Assets?$select=ID,assetTag&$orderby=ID",
      authenticateAs("employee2@company.com")
    );

    expect(data.value).to.deep.equal([
      {
        ID: 4,
        assetTag: "AST-1004"
      }
    ]);
  });

  it("allows an Employee to read only their own requests", async () => {
    const { data } = await GET(
      "/odata/v4/asset/AssetRequests?$select=ID,status&$orderby=ID",
      authenticateAs("employee2@company.com")
    );

    expect(data.value).to.deep.equal([
      {
        ID: 2,
        status: "DRAFT"
      }
    ]);
  });

  it("allows an Approver to read only submitted requests", async () => {
    const { data } = await GET(
      "/odata/v4/asset/AssetRequests?$select=ID,status&$orderby=ID",
      authenticateAs("approver1@company.com")
    );

    expect(data.value).to.deep.equal([
      {
        ID: 1,
        status: "SUBMITTED"
      },
      {
        ID: 3,
        status: "SUBMITTED"
      }
    ]);
  });

  it("allows an HR Approver to read all requests", async () => {
    const { data } = await GET(
      "/odata/v4/asset/AssetRequests?$select=ID,status&$orderby=ID",
      authenticateAs("hrapprover@company.com")
    );

    expect(data.value).to.deep.equal([
      {
        ID: 1,
        status: "SUBMITTED"
      },
      {
        ID: 2,
        status: "DRAFT"
      },
      {
        ID: 3,
        status: "SUBMITTED"
      }
    ]);
  });
});

describe("AssetService workflow actions", () => {
  const expectHttpError = async (requestPromise, expectedStatus) => {
    try {
      await requestPromise;

      throw new Error(
        `Expected HTTP ${expectedStatus}, but the request succeeded.`
      );
    } catch (error) {
      const actualStatus =
        error.response?.status ??
        error.status;

      expect(actualStatus).to.equal(expectedStatus);
    }
  };

  it("enforces roles and completes submit, approve, and reject workflows", async () => {
    await expectHttpError(
      POST(
        "/odata/v4/asset/AssetRequests(2)/AssetService.approveRequest",
        {
          decisionComment: "Employee cannot approve"
        },
        authenticateAs("employee2@company.com")
      ),
      403
    );

    const { data: submittedRequest } = await POST(
      "/odata/v4/asset/AssetRequests(2)/AssetService.submitRequest",
      {},
      authenticateAs("employee2@company.com")
    );

    expect(submittedRequest).to.include({
      ID: 2,
      status: "SUBMITTED"
    });

    const { data: approvedRequest } = await POST(
      "/odata/v4/asset/AssetRequests(2)/AssetService.approveRequest",
      {
        decisionComment: "Approved for finance travel"
      },
      authenticateAs("approver1@company.com")
    );

    expect(approvedRequest).to.include({
      ID: 2,
      status: "APPROVED",
      decisionComment: "Approved for finance travel",
      decidedBy: "approver1@company.com"
    });

    const { data: assignedAsset } = await GET(
      "/odata/v4/asset/Assets(3)?$select=ID,status,assignedTo_ID",
      authenticateAs("admin1@company.com")
    );

    expect(assignedAsset).to.include({
      ID: 3,
      status: "ASSIGNED",
      assignedTo_ID: 2
    });

    await expectHttpError(
      POST(
        "/odata/v4/asset/AssetRequests(1)/AssetService.rejectRequest",
        {
          decisionComment: "   "
        },
        authenticateAs("approver1@company.com")
      ),
      400
    );

    const { data: rejectedRequest } = await POST(
      "/odata/v4/asset/AssetRequests(1)/AssetService.rejectRequest",
      {
        decisionComment: "Requested update is not approved"
      },
      authenticateAs("approver1@company.com")
    );

    expect(rejectedRequest).to.include({
      ID: 1,
      status: "REJECTED",
      decisionComment: "Requested update is not approved",
      decidedBy: "approver1@company.com"
    });

    const { data: unchangedAsset } = await GET(
      "/odata/v4/asset/Assets(1)?$select=ID,status,assignedTo_ID",
      authenticateAs("admin1@company.com")
    );

    expect(unchangedAsset).to.include({
      ID: 1,
      status: "ASSIGNED",
      assignedTo_ID: 1
    });
  });
});

