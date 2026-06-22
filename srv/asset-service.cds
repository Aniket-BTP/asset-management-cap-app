using { asset.management as db } from '../db/schema';

@requires: 'authenticated-user'
@path: '/odata/v4/asset'
service AssetService {

    type CurrentUserInfo {
        id           : String(255);
        isEmployee   : Boolean;
        isHRApprover : Boolean;
        isApprover   : Boolean;
        isAdmin      : Boolean;
    }

    function getCurrentUser()
        returns CurrentUserInfo;


    entity Employees as projection on db.Employees;

    entity Assets as projection on db.Assets;

    entity AssetRequests as projection on db.AssetRequests
        actions {
            action submitRequest()
                returns AssetRequests;

            action approveRequest(
                decisionComment : String(500)
            ) returns AssetRequests;

            action rejectRequest(
                decisionComment : String(500)
            ) returns AssetRequests;
        };
}